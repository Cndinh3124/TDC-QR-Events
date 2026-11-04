variable "region" {
  description = "Vung AWS. Singapore gan Viet Nam nhat."
  type        = string
  default     = "ap-southeast-1"
}

variable "root_domain" {
  description = "Ten mien goc co hosted zone o Route 53."
  type        = string
  default     = "doanhoitdc.id.vn"
}

variable "subdomain" {
  description = "Ten mien phu cua he thong. Dia chi cuoi = <subdomain>.<root_domain>; day cung la PUBLIC_BASE_URL in vao ma QR."
  type        = string
  default     = "diemdanh"
}

variable "instance_type" {
  description = "t3.small (2 GB RAM) la muc toi thieu de chay MySQL + API + build giao dien."
  type        = string
  default     = "t3.small"
}

variable "root_volume_gb" {
  description = "Dung luong o dia (chua ca du lieu MySQL)."
  type        = number
  default     = 20
}

variable "admin_email" {
  description = "Email tai khoan QTV Doan truong tao san khi khoi tao. Mat khau sinh ngau nhien, buoc doi o lan dang nhap dau."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$", var.admin_email))
    error_message = "admin_email khong hop le."
  }
}

variable "admin_name" {
  description = "Ho ten hien thi cua tai khoan QTV Doan truong."
  type        = string
  default     = "Quan tri Doan truong"

  # duoc chen vao kich ban shell trong dau nhay don: cam ky tu dac biet
  validation {
    condition     = can(regex("^[^'\"`$\\\\]{2,120}$", var.admin_name))
    error_message = "admin_name dai 2-120 ky tu, khong chua dau nhay, backtick, $ hoac gach cheo nguoc."
  }
}

variable "letsencrypt_email" {
  description = "Email nhan canh bao het han chung chi Let's Encrypt. De trong thi khong dang ky email."
  type        = string
  default     = ""
}
