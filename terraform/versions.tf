terraform {
  required_version = ">= 1.6"

  required_providers {
    aws      = { source = "hashicorp/aws", version = "~> 6.0" }
    random   = { source = "hashicorp/random", version = "~> 3.6" }
    external = { source = "hashicorp/external", version = "~> 2.3" }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "tdc-qr-events"
      ManagedBy = "terraform"
    }
  }
}
