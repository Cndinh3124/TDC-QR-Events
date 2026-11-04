output "url" {
  value = "https://${local.fqdn}"
}

output "instance_id" {
  value = aws_instance.app.id
}

output "public_ip" {
  value = aws_eip.app.public_ip
}

output "admin_email" {
  value = var.admin_email
}

output "admin_password" {
  description = "Mat khau tam cua QTV Doan truong (buoc doi o lan dang nhap dau). Xem: terraform output -raw admin_password"
  value       = random_password.admin.result
  sensitive   = true
}

output "shell_command" {
  description = "Mo terminal tren may chu (khong can SSH)"
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.app.id}"
}
