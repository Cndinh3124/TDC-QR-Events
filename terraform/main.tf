# Mo hinh re nhat cho demo: MOT may EC2 chay MySQL + API (Docker) + nginx, Elastic IP, DNS Route 53,
# chung chi Let's Encrypt. Khong ALB / RDS / NAT / CloudFront. Xem README.md.

locals {
  fqdn         = "${var.subdomain}.${var.root_domain}"
  ssm_prefix   = "/tdc-qr"
  certbot_args = var.letsencrypt_email == "" ? "--register-unsafely-without-email" : "--email ${var.letsencrypt_email}"
}

data "aws_caller_identity" "me" {}

data "aws_route53_zone" "root" {
  name         = var.root_domain
  private_zone = false
}

# mang mac dinh cua tai khoan: khong tao VPC / NAT moi (NAT ton ~35 USD/thang)
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_ssm_parameter" "ubuntu_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

# ---------- bi mat: sinh ngau nhien, luu SSM SecureString, may chu tu doc luc khoi dong ----------
# Chu y: gia tri van nam trong terraform.tfstate. State dang de local (.gitignore) - dung chia se / commit.

resource "random_password" "db" {
  length  = 32
  special = false # chi chu + so: khong lam hong tep .env
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "device" {
  length  = 64
  special = false
}

resource "random_password" "admin" {
  length  = 20
  special = false
}

resource "aws_ssm_parameter" "secret" {
  for_each = {
    "db-password"    = random_password.db.result
    "jwt-secret"     = random_password.jwt.result
    "device-secret"  = random_password.device.result
    "admin-password" = random_password.admin.result
  }

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = each.value
}

# ---------- ma nguon: dong goi tu git HEAD, dua len S3 rieng tu ----------

data "external" "source" {
  program = ["bash", "${path.module}/scripts/package-source.sh", "${path.module}/.build/source.tar.gz"]
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = "tdc-qr-artifacts-${data.aws_caller_identity.me.account_id}-${var.region}"
  force_destroy = true # demo: cho phep terraform destroy xoa ca khi con tep
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_object" "source" {
  bucket      = aws_s3_bucket.artifacts.id
  key         = "source.tar.gz"
  source      = data.external.source.result.path
  source_hash = data.external.source.result.md5
}

# ---------- quyen cua may chu: SSM Session Manager (khong mo SSH), doc 1 bucket, doc bi mat ----------

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "tdc-qr-app"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "ReadSourceBundle"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }
  statement {
    sid       = "ReadOwnSecrets"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.me.account_id}:parameter${local.ssm_prefix}/*"]
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "tdc-qr-app"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_instance_profile" "app" {
  name = "tdc-qr-app"
  role = aws_iam_role.app.name
}

# ---------- mang ----------

resource "aws_security_group" "web" {
  name        = "tdc-qr-web"
  description = "HTTP/HTTPS tu Internet; khong mo SSH (dung SSM Session Manager)"
  vpc_id      = data.aws_vpc.default.id

  # [BM] cong 3306 / 3000 KHONG mo: MySQL va API chi nghe trong may
  ingress {
    description = "HTTP (chuyen sang HTTPS va xac thuc Lets Encrypt)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "Cho phep ra ngoai (apt, Docker Hub, Lets Encrypt, S3, SSM)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---------- may chu ----------

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.ubuntu_ami.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  metadata_options {
    http_tokens                 = "required" # [BM] IMDSv2
    http_put_response_hop_limit = 1          # container khong doc duoc thong tin dang nhap cua may
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_gb
    encrypted   = true
  }

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region       = var.region
    bucket       = aws_s3_bucket.artifacts.id
    domain       = local.fqdn
    admin_email  = var.admin_email
    admin_name   = var.admin_name
    certbot_args = local.certbot_args
    ssm_prefix   = local.ssm_prefix
  })

  # CSDL nam tren o dia cua may nay: doi user_data / AMI khong duoc phep tao lai may (mat du lieu).
  # Sua kich ban khoi tao thi cap nhat tren may bang `sudo tdc-deploy` (xem README).
  lifecycle {
    ignore_changes = [ami, user_data]
  }

  depends_on = [aws_s3_object.source, aws_ssm_parameter.secret, aws_iam_role_policy.app]
}

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id
}

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.fqdn
  type    = "A"
  ttl     = 60
  records = [aws_eip.app.public_ip]
}
