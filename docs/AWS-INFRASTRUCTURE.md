# AWS Infrastructure Setup Guide

## Overview

Denna guide beskriver hur man sätter upp AWS-infrastrukturen för SkyManuals aviation platform. Systemet är designat för production-ready deployment med fokus på aviation compliance, säkerhet och skalbarhet.

## Implementation Status: ~80% Complete

**✅ Implementerade AWS Services:**
- S3 chunk storage med encryption och compression
- CloudFront CDN för global distribution
- RDS PostgreSQL med pgvector för vector search
- ElastiCache Redis för session management
- ECS Fargate för containerized services

**🔄 Pågående Implementation:**
- Lambda functions för background processing
- CloudWatch dashboards för monitoring
- AWS Config för compliance tracking

**📋 Planerad Implementation:**
- Application Load Balancer med WAF
- X-Ray tracing för performance monitoring
- AWS Backup för disaster recovery

## Architecture Overview

```mermaid
graph TB
    subgraph "AWS Cloud"
        subgraph "Compute Layer"
            ECS[ECS Fargate<br/>API Services]
            Lambda[Lambda Functions<br/>Background Tasks]
        end
        
        subgraph "Storage Layer"
            S3[S3 Buckets<br/>Document Chunks]
            RDS[(RDS PostgreSQL<br/>+ pgvector)]
            ElastiCache[(ElastiCache Redis<br/>Sessions)]
        end
        
        subgraph "Network Layer"
            ALB[Application Load Balancer]
            CloudFront[CloudFront CDN]
            WAF[AWS WAF<br/>Security]
            VPC[VPC with Private Subnets]
        end
        
        subgraph "Monitoring Layer"
            CloudWatch[CloudWatch<br/>Logs & Metrics]
            XRay[X-Ray<br/>Tracing]
            Config[AWS Config<br/>Compliance]
        end
    end
    
    subgraph "External"
        Users[Users & EFB Devices]
        CI[GitHub Actions<br/>CI/CD]
    end
    
    Users --> CloudFront
    CloudFront --> ALB
    ALB --> WAF
    WAF --> ECS
    ECS --> RDS
    ECS --> ElastiCache
    ECS --> S3
    ECS --> Lambda
    CI --> ECS
    ECS --> CloudWatch
    ECS --> XRay
```

## Prerequisites

### Required AWS Services
- AWS Account med admin access
- AWS CLI v2 installed och configured
- Terraform v1.5+ (för infrastructure as code)
- Docker (för container builds)

### Required Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:*",
        "rds:*",
        "elasticache:*",
        "s3:*",
        "cloudfront:*",
        "lambda:*",
        "ec2:*",
        "iam:*",
        "cloudwatch:*",
        "logs:*",
        "xray:*",
        "config:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## Infrastructure Components

### 1. VPC and Networking

```hcl
# terraform/vpc.tf
resource "aws_vpc" "skymanuals" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "skymanuals-vpc"
    Environment = var.environment
  }
}

resource "aws_subnet" "private" {
  count = 2
  vpc_id            = aws_vpc.skymanuals.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "skymanuals-private-${count.index + 1}"
    Environment = var.environment
  }
}

resource "aws_subnet" "public" {
  count = 2
  vpc_id                  = aws_vpc.skymanuals.id
  cidr_block              = "10.0.${count.index + 10}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "skymanuals-public-${count.index + 1}"
    Environment = var.environment
  }
}
```

### 2. RDS PostgreSQL Database

```hcl
# terraform/rds.tf
resource "aws_db_subnet_group" "skymanuals" {
  name       = "skymanuals-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "skymanuals-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "skymanuals-rds-"
  vpc_id      = aws_vpc.skymanuals.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier = "skymanuals-postgres"
  engine     = "postgres"
  engine_version = "15.4"
  instance_class = var.database_instance_class
  allocated_storage = 100
  max_allocated_storage = 1000
  storage_type = "gp3"
  storage_encrypted = true

  db_name  = "skymanuals"
  username = var.database_username
  password = var.database_password

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.skymanuals.name

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  skip_final_snapshot = false
  final_snapshot_identifier = "skymanuals-postgres-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  tags = {
    Name = "skymanuals-postgres"
    Environment = var.environment
  }
}
```

### 3. ElastiCache Redis

```hcl
# terraform/redis.tf
resource "aws_elasticache_subnet_group" "skymanuals" {
  name       = "skymanuals-cache-subnet"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "redis" {
  name_prefix = "skymanuals-redis-"
  vpc_id      = aws_vpc.skymanuals.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id         = "skymanuals-redis"
  description                  = "Redis cluster for SkyManuals"

  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = "default.redis7"

  num_cache_clusters = 2
  automatic_failover_enabled = true
  multi_az_enabled = true

  subnet_group_name  = aws_elasticache_subnet_group.skymanuals.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = {
    Name = "skymanuals-redis"
    Environment = var.environment
  }
}
```

### 4. S3 Buckets for Chunk Storage

```hcl
# terraform/s3.tf
resource "aws_s3_bucket" "chunks" {
  bucket = "${var.environment}-skymanuals-chunks"

  tags = {
    Name = "skymanuals-chunks"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "chunks" {
  bucket = aws_s3_bucket.chunks.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "chunks" {
  bucket = aws_s3_bucket.chunks.id

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "chunks" {
  bucket = aws_s3_bucket.chunks.id

  rule {
    id     = "transition_to_ia"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555  # 7 years for aviation compliance
    }
  }
}
```

### 5. ECS Fargate Cluster

```hcl
# terraform/ecs.tf
resource "aws_ecs_cluster" "skymanuals" {
  name = "skymanuals"

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.ecs.name
      }
    }
  }

  tags = {
    Name = "skymanuals-cluster"
    Environment = var.environment
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "skymanuals-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn           = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = "${var.ecr_repository_url}:latest"
      
      portMappings = [
        {
          containerPort = 3001
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "DATABASE_URL"
          value = "postgresql://${var.database_username}:${var.database_password}@${aws_db_instance.postgres.endpoint}:5432/${aws_db_instance.postgres.db_name}"
        },
        {
          name  = "REDIS_URL"
          value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
        },
        {
          name  = "AWS_S3_BUCKET"
          value = aws_s3_bucket.chunks.bucket
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = {
    Name = "skymanuals-api-task"
    Environment = var.environment
  }
}

resource "aws_ecs_service" "api" {
  name            = "skymanuals-api"
  cluster         = aws_ecs_cluster.skymanuals.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener.api]

  tags = {
    Name = "skymanuals-api-service"
    Environment = var.environment
  }
}
```

### 6. CloudFront CDN

```hcl
# terraform/cloudfront.tf
resource "aws_cloudfront_distribution" "skymanuals" {
  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "skymanuals-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "SkyManuals Aviation Platform CDN"
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "skymanuals-api"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "CloudFront-Forwarded-Proto"]
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  # Cache behavior for API endpoints
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "skymanuals-api"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "CloudFront-Forwarded-Proto"]
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "skymanuals-cdn"
    Environment = var.environment
  }
}
```

## Environment Variables

### Required Environment Variables

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@hostname:5432/database
DATABASE_POOL_SIZE=20
DATABASE_TIMEOUT=30000

# Redis Configuration
REDIS_URL=redis://hostname:6379
REDIS_PASSWORD=your_redis_password

# AWS Configuration
AWS_REGION=us-east-1
AWS_S3_BUCKET=production-skymanuals-chunks
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# JWT Configuration
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h

# Application Configuration
NODE_ENV=production
PORT=3001
API_URL=https://api.skymanuals.com

# Aviation Compliance
COMPLIANCE_FRAMEWORK=EASA,FAA
AUDIT_RETENTION_DAYS=2555  # 7 years
```

## Deployment Process

### 1. Infrastructure Deployment

```bash
# Initialize Terraform
cd terraform/
terraform init

# Plan infrastructure changes
terraform plan -var-file="environments/production.tfvars"

# Apply infrastructure
terraform apply -var-file="environments/production.tfvars"
```

### 2. Application Deployment

```bash
# Build and push Docker image
docker build -t skymanuals-api .
docker tag skymanuals-api:latest $ECR_REPOSITORY_URL:latest
docker push $ECR_REPOSITORY_URL:latest

# Update ECS service
aws ecs update-service \
  --cluster skymanuals \
  --service skymanuals-api \
  --force-new-deployment
```

### 3. Database Migration

```bash
# Run Prisma migrations
npm run db:migrate --workspace=apps/api

# Seed initial data
npm run db:seed --workspace=apps/api
```

## ELK Stack for Advanced Logging

### Elasticsearch Configuration

```hcl
# terraform/elasticsearch.tf
resource "aws_elasticsearch_domain" "skymanuals" {
  domain_name           = "skymanuals-logs"
  elasticsearch_version = "7.10"

  cluster_config {
    instance_type            = var.elasticsearch_instance_type
    instance_count          = var.elasticsearch_instance_count
    dedicated_master_enabled = true
    master_instance_type    = var.elasticsearch_master_instance_type
    master_instance_count   = 3
    zone_awareness_enabled   = true

    zone_awareness_config {
      availability_zone_count = 3
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.elasticsearch_volume_size
  }

  vpc_options {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.elasticsearch.id]
  }

  encrypt_at_rest {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  node_to_node_encryption {
    enabled = true
  }

  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = "es:*"
        Resource = "arn:aws:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/skymanuals-logs/*"
        Condition = {
          IpAddress = {
            "aws:SourceIp" = var.allowed_ips
          }
        }
      }
    ]
  })

  tags = {
    Name = "skymanuals-elasticsearch"
    Environment = var.environment
  }
}

resource "aws_security_group" "elasticsearch" {
  name_prefix = "skymanuals-elasticsearch-"
  vpc_id      = aws_vpc.skymanuals.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "skymanuals-elasticsearch-sg"
  }
}
```

### Logstash Pipeline

```ruby
# config/logstash.conf
input {
  cloudwatch_logs {
    log_group => "/ecs/skymanuals-api"
    region => "us-east-1"
    codec => "json"
  }
  
  cloudwatch_logs {
    log_group => "/ecs/skymanuals"
    region => "us-east-1"
    codec => "json"
  }
}

filter {
  # Parse JSON messages
  if [message] =~ /^\{.*\}$/ {
    json {
      source => "message"
    }
  }

  # Aviation-specific parsing
  if [logType] == "audit" {
    grok {
      match => { "message" => "%{TIMESTAMP_ISO8601:timestamp} \[%{WORD:level}\] %{GREEDYDATA:message}" }
    }
    
    date {
      match => [ "timestamp", "ISO8601" ]
    }
    
    # Parse aviation compliance fields
    if [complianceMetadata] {
      json {
        source => "complianceMetadata"
        target => "compliance"
      }
    }
  }

  # Parse EFB sync events
  if [eventType] == "SYNC_EVENT" {
    mutate {
      add_field => { "sync_scenario" => "%{[metadata][scenario]}" }
      add_field => { "sync_priority" => "%{[metadata][priority]}" }
    }
  }

  # Parse security events
  if [eventType] == "SECURITY_EVENT" {
    mutate {
      add_field => { "security_level" => "%{[metadata][severity]}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["${ELASTICSEARCH_ENDPOINT}"]
    index => "skymanuals-logs-%{+YYYY.MM.dd}"
    
    template_name => "skymanuals-logs"
    template => "/usr/share/logstash/templates/skymanuals-template.json"
    template_overwrite => true
  }
  
  # Aviation compliance alerts
  if [compliance][requiresReporting] == true {
    email {
      to => "compliance@skymanuals.com"
      subject => "Aviation Compliance Alert: %{message}"
      body => "Compliance violation detected: %{message}"
    }
  }
}
```

### Kibana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "SkyManuals Aviation Platform Dashboard",
    "panels": [
      {
        "title": "API Response Times",
        "type": "line",
        "query": {
          "bool": {
            "must": [
              { "term": { "logType": "api" } },
              { "range": { "@timestamp": { "gte": "now-1h" } } }
            ]
          }
        },
        "aggs": {
          "response_time": {
            "avg": { "field": "responseTime" }
          }
        }
      },
      {
        "title": "EFB Sync Status",
        "type": "pie",
        "query": {
          "bool": {
            "must": [
              { "term": { "eventType": "SYNC_EVENT" } },
              { "range": { "@timestamp": { "gte": "now-24h" } } }
            ]
          }
        },
        "aggs": {
          "sync_status": {
            "terms": { "field": "status" }
          }
        }
      },
      {
        "title": "Aviation Compliance Events",
        "type": "table",
        "query": {
          "bool": {
            "must": [
              { "term": { "logType": "audit" } },
              { "exists": { "field": "compliance" } },
              { "range": { "@timestamp": { "gte": "now-7d" } } }
            ]
          }
        }
      },
      {
        "title": "Security Events",
        "type": "bar",
        "query": {
          "bool": {
            "must": [
              { "term": { "eventType": "SECURITY_EVENT" } },
              { "range": { "@timestamp": { "gte": "now-24h" } } }
            ]
          }
        },
        "aggs": {
          "security_events": {
            "terms": { "field": "security_level" }
          }
        }
      }
    ]
  }
}
```

### Logstash Template for Aviation Data

```json
{
  "index_patterns": ["skymanuals-logs-*"],
  "mappings": {
    "properties": {
      "@timestamp": { "type": "date" },
      "level": { "type": "keyword" },
      "message": { "type": "text" },
      "logType": { "type": "keyword" },
      "eventType": { "type": "keyword" },
      "userId": { "type": "keyword" },
      "deviceId": { "type": "keyword" },
      "organizationId": { "type": "keyword" },
      "compliance": {
        "properties": {
          "regulatoryFrameworks": { "type": "keyword" },
          "certificationLevel": { "type": "keyword" },
          "requiresReporting": { "type": "boolean" }
        }
      },
      "sync_scenario": { "type": "keyword" },
      "sync_priority": { "type": "keyword" },
      "security_level": { "type": "keyword" },
      "responseTime": { "type": "long" },
      "status": { "type": "keyword" }
    }
  }
}
```

### ELK Stack Deployment

```hcl
# terraform/logstash.tf
resource "aws_ecs_task_definition" "logstash" {
  family                   = "skymanuals-logstash"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn           = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "logstash"
      image = "logstash:7.17.0"
      
      environment = [
        {
          name  = "ELASTICSEARCH_ENDPOINT"
          value = aws_elasticsearch_domain.skymanuals.endpoint
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.logstash.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = {
    Name = "skymanuals-logstash"
    Environment = var.environment
  }
}

resource "aws_ecs_service" "logstash" {
  name            = "skymanuals-logstash"
  cluster         = aws_ecs_cluster.skymanuals.id
  task_definition = aws_ecs_task_definition.logstash.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  tags = {
    Name = "skymanuals-logstash-service"
    Environment = var.environment
  }
}
```

## Monitoring and Observability

### CloudWatch Dashboards

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ECS", "CPUUtilization", "ServiceName", "skymanuals-api"],
          ["AWS/ECS", "MemoryUtilization", "ServiceName", "skymanuals-api"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "ECS Service Metrics"
      }
    }
  ]
}
```

### Log Aggregation

```hcl
# terraform/logs.tf
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/skymanuals-api"
  retention_in_days = 30

  tags = {
    Name = "skymanuals-api-logs"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/skymanuals"
  retention_in_days = 30

  tags = {
    Name = "skymanuals-ecs-logs"
    Environment = var.environment
  }
}
```

## Security Considerations

### Network Security
- Private subnets för databas och cache
- Security groups med minimal required access
- VPC endpoints för AWS services
- WAF rules för API protection

### Data Encryption
- S3 bucket encryption med AES-256
- RDS encryption at rest
- ElastiCache encryption in transit och at rest
- CloudFront HTTPS enforcement

### Access Control
- IAM roles med least privilege principle
- ECS task roles för AWS service access
- Database access via security groups only
- API authentication med JWT tokens

## Monthly Cost Estimates

### Small Deployment (1-5 airlines, 100-500 users)

**Core Infrastructure:**
- **ECS Fargate**: 2 tasks × $50 = $100/month
- **RDS PostgreSQL** (db.t3.medium): $85/month
- **ElastiCache Redis** (cache.t3.micro): $15/month
- **S3 Storage** (500GB): $12/month
- **CloudFront** (2TB transfer): $170/month

**Monitoring & Logging:**
- **CloudWatch Logs** (30 days retention): $25/month
- **CloudWatch Metrics**: $10/month
- **ELK Stack** (Elasticsearch t3.medium): $120/month

**Security & Compliance:**
- **AWS WAF**: $5/month
- **AWS Config**: $10/month
- **AWS Backup**: $15/month

**Total Small Deployment: ~$567/month**

### Medium Deployment (5-20 airlines, 500-2000 users)

**Core Infrastructure:**
- **ECS Fargate**: 5 tasks × $50 = $250/month
- **RDS PostgreSQL** (db.r5.large with Multi-AZ): $340/month
- **ElastiCache Redis** (cache.r5.large): $180/month
- **S3 Storage** (5TB): $115/month
- **CloudFront** (20TB transfer): $1,200/month

**Monitoring & Logging:**
- **CloudWatch Logs** (30 days retention): $80/month
- **CloudWatch Metrics**: $25/month
- **ELK Stack** (Elasticsearch r5.large cluster): $400/month

**Security & Compliance:**
- **AWS WAF**: $20/month
- **AWS Config**: $25/month
- **AWS Backup**: $50/month
- **X-Ray Tracing**: $30/month

**Total Medium Deployment: ~$2,715/month**

### Large Deployment (20+ airlines, 2000+ users)

**Core Infrastructure:**
- **ECS Fargate**: 10+ tasks × $50 = $500+/month
- **RDS PostgreSQL** (db.r5.xlarge Multi-AZ): $800+/month
- **ElastiCache Redis** (cache.r5.xlarge cluster): $600+/month
- **S3 Storage** (50TB+): $1,000+/month
- **CloudFront** (100TB+ transfer): $5,000+/month

**Monitoring & Logging:**
- **CloudWatch Logs** (30 days retention): $200+/month
- **CloudWatch Metrics**: $50+/month
- **ELK Stack** (Elasticsearch r5.xlarge cluster): $1,200+/month

**Security & Compliance:**
- **AWS WAF**: $50+/month
- **AWS Config**: $50+/month
- **AWS Backup**: $100+/month
- **X-Ray Tracing**: $100+/month

**Total Large Deployment: ~$9,700+/month**

### Enterprise Deployment (50+ airlines, 5000+ users)

**Contact for enterprise pricing**
- Estimated: $15,000-25,000/month
- Custom SLA agreements
- Dedicated support
- Advanced security features
- Multi-region deployment

## Cost Optimization Strategies

### S3 Lifecycle Policies
- **Standard → IA**: After 30 days (saves ~40%)
- **IA → Glacier**: After 90 days (saves ~60%)
- **Glacier → Deep Archive**: After 365 days (saves ~80%)
- **7-year retention**: Aviation compliance requirement

### ECS Scaling
- **Auto-scaling**: CPU/Memory utilization (saves 30-50% during low usage)
- **Scheduled scaling**: Maintenance windows
- **Spot instances**: Non-critical workloads (saves 70% vs On-Demand)

### Database Optimization
- **Read replicas**: Read-heavy workloads
- **Automated backups**: 7-day retention
- **Multi-AZ deployment**: High availability
- **Reserved instances**: 1-3 year commitment (saves 30-60%)

### ELK Stack Optimization
- **Index lifecycle management**: Automatic rollover and deletion
- **Compression**: Enable compression on indices
- **Shard optimization**: Optimal shard sizing
- **Cold storage**: Move old indices to cheaper storage

### Cost Monitoring
```bash
# AWS Cost Explorer queries
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

### Cost Alerts
```hcl
# terraform/cost-alerts.tf
resource "aws_budgets_budget" "monthly" {
  name         = "skymanuals-monthly-budget"
  budget_type  = "COST"
  limit_amount = "2000"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filters = {
    Service = ["Amazon Elastic Compute Cloud - Compute", "Amazon Relational Database Service", "Amazon Simple Storage Service"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = ["admin@skymanuals.com"]
  }
}
```

## Disaster Recovery

### Backup Strategy
- Daily automated RDS snapshots
- S3 cross-region replication
- Configuration backup med Terraform state
- Application data backup med pg_dump

### Recovery Procedures
- RTO: 4 hours för critical operations
- RPO: 1 hour för data loss tolerance
- Automated failover för database
- Manual failover för application services

## Compliance and Auditing

### Aviation Compliance
- 7-year data retention per EASA/FAA requirements
- Comprehensive audit logging
- Chain of custody tracking
- Regulatory framework compliance

### Security Auditing
- CloudTrail för API calls
- Config rules för compliance checking
- VPC Flow Logs för network monitoring
- Security Hub för vulnerability management

## Troubleshooting

### Common Issues

**ECS Service Health Checks Failing:**
```bash
# Check service logs
aws logs describe-log-streams --log-group-name /ecs/skymanuals-api
aws logs get-log-events --log-group-name /ecs/skymanuals-api --log-stream-name stream-name
```

**Database Connection Issues:**
```bash
# Test database connectivity
psql "postgresql://username:password@hostname:5432/database"
```

**S3 Access Issues:**
```bash
# Test S3 access
aws s3 ls s3://bucket-name
aws s3 cp test-file.txt s3://bucket-name/
```

### Performance Monitoring

**Database Performance:**
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

**API Performance:**
```bash
# Monitor API response times
curl -w "@curl-format.txt" -o /dev/null -s "https://api.skymanuals.com/api/health"
```

## Next Steps

1. **Implement Lambda Functions** för background processing
2. **Set up X-Ray Tracing** för distributed tracing
3. **Configure AWS Config** för compliance monitoring
4. **Implement Auto Scaling** för dynamic resource management
5. **Set up Monitoring Dashboards** för operational visibility

Denna infrastruktur ger en solid grund för SkyManuals aviation platform med fokus på säkerhet, compliance och skalbarhet.
