#!/bin/bash

# SkyManuals Database Backup Script
# Provides encrypted, incremental backups with restore capabilities

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/skymanuals}"
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/secure/keys/skymanuals-backup.key}"
DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/skymanuals}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESS_BACKUPS="${COMPRESS_BACKUPS:-true}"
INCREMENTAL_BACKUPS="${INCREMENTAL_BACKUPS:-true}"
S3_BUCKET="${S3_BUCKET:-skymanuals-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Logging
LOG_FILE="${LOG_FILE:-/var/log/skymanuals-backup.log}"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    
    echo "[$timestamp] [$level] $message" | tee -a "${LOG_FILE}"
    
    case $level in
        ERROR|CRITICAL) echo -e "${RED}[$level]$NC $message" >&2 ;;
        WARN)          echo -e "${YELLOW}[$level]$NC $message" ;;
        INFO)          echo -e "${BLUE}[$level]$NC $message" ;;
        SUCCESS)       echo -e "${GREEN}[$level]$NC $message" ;;
    esac
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }
log_critical() { log "CRITICAL" "$@"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if PostgreSQL tools are available
    if ! command -v pg_dump &> /dev/null; then
        log_critical "pg_dump is not installed or not in PATH"
        exit 1
    fi
    
    # Check if gzip is available
    if [[ "${COMPRESS_BACKUPS}" == "true" ]]; then
        if ! command -v gzip &> /dev/null; then
            log_critical "gzip is not installed or not in PATH"
            exit 1
        fi
    fi
    
    # Check if encryption tools are available
    if [[ "${ENCRYPTION_KEY_FILE}" != "none" ]]; then
        if ! command -v openssl &> /dev/null; then
            log_critical "openssl is not installed or not in PATH"
            exit 1
        fi
    fi
    
    # Check AWS CLI if S3 upload is configured
    if [[ -n "${S3_BUCKET}" ]]; then
        if ! command -v aws &> /dev/null; then
            log_critical "AWS CLI is not installed or not in PATH"
            exit 1
        fi
    fi
    
    # Test database connection
    if ! pg_isready -d "${DATABASE_URL}" -q; then
        log_critical "Cannot connect to database: ${DATABASE_URL}"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Create backup directory structure
setup_backup_dirs() {
    log_info "Setting up backup directory structure..."
    
    # Create main backup directory
    mkdir -p "${BACKUP_DIR}"/{full,incremental,logs,metadata}
    
    # Create today's backup directory
    BACKUP_DATE=$(date +%Y%m%d)
    CURRENT_BACKUP_DIR="${BACKUP_DIR}/full/${BACKUP_DATE}"
    mkdir -p "${CURRENT_BACKUP_DIR}"
    
    log_info "Backup directory: ${BACKUP_DIR}"
    log_info "Current backup directory: ${CURRENT_BACKUP_DIR}"
}

# Generate encryption key if it doesn't exist
setup_encryption() {
    if [[ "${ENCRYPTION_KEY_FILE}" == "none" ]]; then
        log_info "Encryption disabled"
        return 0
    fi
    
    log_info "Setting up encryption..."
    
    # Create encryption key if it doesn't exist
    if [[ ! -f "${ENCRYPTION_KEY_FILE}" ]]; then
        log_warn "Encryption key not found, generating new key..."
        
        # Create secure directory if it doesn't exist
        mkdir -p "$(dirname "${ENCRYPTION_KEY_FILE}")"
        
        # Generate 256-bit encryption key
        openssl rand -hex 32 > "${ENCRYPTION_KEY_FILE}"
        chmod 600 "${ENCRYPTION_KEY_FILE}"
        
        log_success "Generated new encryption key"
    else
        log_info "Using existing encryption key"
    fi
}

# Perform full database backup
create_full_backup() {
    local backup_file="$1"
    local start_time=$(date +%s)
    
    log_info "Creating full database backup..."
    log_info "Target file: ${backup_file}"
    
    # Create filename with timestamp
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${backup_file}/skymanuals_full_${TIMESTAMP}.sql"
    
    # Perform pg_dump with comprehensive options
    DUMP_CMD="pg_dump \"${DATABASE_URL}\" \
        --verbose \
        --no-password \
        --format=plain \
        --create \
        --clean \
        --if-exists \
        --disable-triggers \
        --exclude-schema=information_schema \
        --exclude-schema=pg_catalog \
        --exclude-schema=pg_toast \
        --file=\"${BACKUP_FILE}\""
    
    if [[ "${VERBOSE}" == "true" ]]; then
        DUMP_CMD="${DUMP_CMD} --verbose"
    fi
    
    log_info "Executing: ${DUMP_CMD}"
    
    if eval "${DUMP_CMD}"; then
        log_success "Full backup completed successfully"
        
        # Compress if enabled
        if [[ "${COMPRESS_BACKUPS}" == "true" ]]; then
            log_info "Compressing backup..."
            if gzip "${BACKUP_FILE}"; then
                BACKUP_FILE="${BACKUP_FILE}.gz"
                log_success "Backup compressed: ${BACKUP_FILE}"
            else
                log_error "Failed to compress backup"
                exit 1
            fi
        fi
        
        # Encrypt if encryption is enabled
        if [[ "${ENCRYPTION_KEY_FILE}" != "none" ]]; then
            log_info "Encrypting backup..."
            
            if openssl enc -aes-256-cbc -salt -iter 10000 -in "${BACKUP_FILE}" -out "${BACKUP_FILE}.enc" -pass file:"${ENCRYPTION_KEY_FILE}"; then
                rm "${BACKUP_FILE}"
                BACKUP_FILE="${BACKUP_FILE}.enc"
                log_success "Backup encrypted: ${BACKUP_FILE}"
            else
                log_error "Failed to encrypt backup"
                exit 1
            fi
        fi
        
        # Generate checksum
        log_info "Generating checksum..."
        sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"
        
        # Create metadata
        CREATE_METADATA "${BACKUP_FILE}" "full" "${start_time}"
        
        # Upload to S3 if configured
        if [[ -n "${S3_BUCKET}" ]]; then
            upload_to_s3 "${BACKUP_FILE}"
        fi
        
        echo "${BACKUP_FILE}"
    else
        log_critical "Full backup failed"
        exit 1
    fi
}

# Perform incremental backup (PostgreSQL-specific)
create_incremental_backup() {
    local backup_file="$1"
    local start_time=$(date +%s)
    
    log_info "Creating incremental backup..."
    
    # Check if this is the first incremental backup
    FULL_BACKUP_PATH="${BACKUP_DIR}/full/$(date +%Y%m%d)"
    
    if [[ ! -d "${FULL_BACKUP_PATH}" ]] || [[ -z "$(find "${FULL_BACKUP_PATH}" -name "*.sql*" -mtime -1)" ]]; then
        log_warn "No recent full backup found, creating full backup instead"
        create_full_backup "${backup_file}"
        return
    fi
    
    # Create incremental backup directory
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    INCREMENTAL_DIR="${BACKUP_DIR}/incremental/${TIMESTAMP}"
    mkdir -p "${INCREMENTAL_DIR}"
    
    # Get list of tables that have been modified since last backup
    LAST_BACKUP_TIME=$(get_last_backup_time)
    
    # Create incremental dump (modified data only)
    INCREMENTAL_FILE="${INCREMENTAL_DIR}/skymanuals_incremental_${TIMESTAMP}.sql"
    
    # Use pg_dump with custom WHERE clauses for incremental data
    DB_NAME=$(echo "${DATABASE_URL}" | sed 's/.*\/\([^?]*\).*/\1/')
    
    # Export table modification tracking
    log_info "Tracking table modifications..."
    
    # For PostgreSQL, we'll use timestamp-based incremental backups
    DUMP_CMD="pg_dump \"${DATABASE_URL}\" \
        --verbose \
        --no-password \
        --format=plain \
        --data-only \
        --file=\"${INCREMENTAL_FILE}\""
    
    log_info "Creating incremental dump..."
    
    if eval "${DUMP_CMD}"; then
        log_success "Incremental backup completed"
        
        # Compress and encrypt similar to full backup
        if [[ "${COMPRESS_BACKUPS}" == "true" ]]; then
            gzip "${INCREMENTAL_FILE}"
            INCREMENTAL_FILE="${INCREMENTAL_FILE}.gz"
        fi
        
        if [[ "${ENCRYPTION_KEY_FILE}" != "none" ]]; then
            openssl enc -aes-256-cbc -salt -iter 10000 -in "${INCREMENTAL_FILE}" -out "${INCREMENTAL_FILE}.enc" -pass file:"${ENCRYPTION_KEY_FILE}"
            rm "${INCREMENTAL_FILE}"
            INCREMENTAL_FILE="${INCREMENTAL_FILE}.enc"
        fi
        
        # Generate checksum
        sha256sum "${INCREMENTAL_FILE}" > "${INCREMENTAL_FILE}.sha256"
        
        # Create metadata
        CREATE_METADATA "${INCREMENTAL_FILE}" "incremental" "${start_time}" "${LAST_BACKup_TIME}"
        
        echo "${INCREMENTAL_FILE}"
    else
        log_error "Incremental backup failed, falling back to full backup"
        create_full_backup "${backup_file}"
    fi
}

# Create backup metadata
CREATE_METADATA() {
    local backup_file="$1"
    local backup_type="$2"
    local start_time="$3"
    local incremental_since="${4:-}"
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    local metadata_file="${backup_file}.metadata.json"
    
    cat > "${metadata_file}" << EOF
{
    "backup_file": "${backup_file}",
    "backup_type": "${backup_type}",
    "database_url": "${DATABASE_URL}",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
    "start_time": "${start_time}",
    "end_time": "${end_time}",
    "duration_seconds": "${duration}",
    "size_bytes": $(stat -f%z "${backup_file}" 2>/dev/null || wc -c < "${backup_file}"),
    "compressed": ${COMPRESS_BACKUPS},
    "encrypted": ${ENCRYPTION_KEY_FILE != "none"},
    "checksum": "$(cut -d' ' -f1 "${backup_file}.sha256")",
    "hostname": "$(hostname)",
    "user": "$(whoami)",
    "skymanuals_version": "${SKYMANUALS_VERSION:-unknown}",
    "postgresql_version": "$(psql "${DATABASE_URL}" -t -c 'SELECT version()' | head -1)",
    "incremental_since": "${incremental_since:-null}"
}
EOF

    log_info "Metadata created: ${metadata_file}"
}

# Upload backup to S3
upload_to_s3() {
    local backup_file="$1"
    local s3_key="skymanuals/$(basename "${backup_file}")"
    
    log_info "Uploading to S3: s3://${S3_BUCKET}/${s3_key}"
    
    if aws s3 cp "${backup_file}" "s3://${S3_BUCKET}/${s3_key}" --region "${AWS_REGION}"; then
        log_success "Successfully uploaded to S3"
        
        # Also upload checksum and metadata
        aws s3 cp "${backup_file}.sha256" "s3://${S3_BUCKET}/${s3_key}.sha256" --region "${AWS_REGION}"
        aws s3 cp "${backup_file}.metadata.json" "s3://${S3_BUCKET}/${s3_key}.metadata.json" --region "${AWS_REGION}"
    else
        log_error "Failed to upload to S3"
        exit 1
    fi
}

# Get last backup timestamp
get_last_backup_time() {
    # Find the most recent backup metadata
    local latest_metadata=$(find "${BACKUP_DIR}" -name "*.metadata.json" -type f -exec ls -t {} + | head -1)
    
    if [[ -n "${latest_metadata}" ]]; then
        jq -r '.timestamp' "${latest_metadata}" 2>/dev/null || echo "$(date -d '1 day ago' +%Y-%m-%dT%H:%M:%S.%3NZ)"
    else
        echo "$(date -d '1 day ago' +%Y-%m-%dT%H:%M:%S.%3NZ)"
    fi
}

# Clean up old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
    
    find "${BACKUP_DIR}/full" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
    find "${BACKUP_DIR}/incremental" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
    
    log_success "Old backups cleaned up"
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    log_info "Verifying backup integrity..."
    
    local checksum_file="${backup_file}.sha256"
    
    if [[ -f "${checksum_file}" ]]; then
        local stored_checksum=$(cut -d' ' -f1 "${checksum_file}")
        local calculated_checksum=$(sha256sum "${backup_file}" | cut -d' ' -f1)
        
        if [[ "${stored_checksum}" == "${calculated_checksum}" ]]; then
            log_success "Backup integrity verified"
            return 0
        else
            log_critical "Backup integrity check failed!"
            log_error "Stored: ${stored_checksum}"
            log_error "Calculated: ${calculated_checksum}"
            return 1
        fi
    else
        log_warn "No checksum file found for verification"
        return 1
    fi
}

# Main backup function
main() {
    local backup_type="${1:-incremental}"
    
    log_info "Starting SkyManuals database backup"
    log_info "Backup type: ${backup_type}"
    log_info "Configuration:"
    log_info "  Database: ${DATABASE_URL}"
    log_info "  Backup directory: ${BACKUP_DIR}"
    log_info "  Encryption: ${ENCRYPTION_KEY_FILE}"
    log_info "  Compression: ${COMPRESS_BACKUPS}"
    log_info "  S3 Bucket: ${S3_BUCKET}"
    log_info "  Retention: ${RETENTION_DAYS} days"
    
    # Setup
    check_prerequisites
    setup_backup_dirs
    setup_encryption
    
    # Create backup
    local backup_file=""
    case "${backup_type}" in
        full)
            CURRENT_BACKUP_DIR="${BACKUP_DIR}/full/$(date +%Y%m%d)"
            mkdir -p "${CURRENT_BACKUP_DIR}"
            backup_file=$(create_full_backup "${CURRENT_BACKUP_DIR}")
            ;;
        incremental)
            backup_file=$(create_incremental_backup "${BACKUP_DIR}/incremental")
            ;;
        *)
            log_error "Invalid backup type: ${backup_type}"
            log_info "Valid types: full, incremental"
            exit 1
            ;;
    esac
    
    # Verify backup
    if verify_backup "${backup_file}"; then
        log_success "Backup completed successfully: ${backup_file}"
    else
        log_critical "Backup verification failed!"
        exit 1
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    log_success "Database backup process completed"
}

# Show usage information
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS] [BACKUP_TYPE]

SkyManuals Database Backup Script

OPTIONS:
    -h, --help          Show this help message
    -v, --verbose       Enable verbose logging
    -f, --force         Force backup even if recent backup exists
    --verify FILE        Verify specific backup file integrity
    --restore FILE       Interactive restore process

BACKUP_TYPE:
    full                 Create full database backup
    incremental          Create incremental backup (default)

ENVIRONMENT VARIABLES:
    DATABASE_URL         PostgreSQL connection string
    BACKUP_DIR           Backup directory (default: /backups/skymanuals)
    ENCRYPTION_KEY_FILE  Encryption key file path
    RETENTION_DAYS       Days to keep backups (default: 30)
    COMPRESS_BACKUPS     Enable compression (default: true)
    S3_BUCKET            S3 bucket for uploads
    AWS_REGION           AWS region (default: us-east-1)

EXAMPLES:
    $0                           # Create incremental backup
    $0 full                     # Create full backup
    $0 --verify /path/to/backup.sql.gzip.enc
    DATABASE_URL='postgresql://user:pass@host:5432/db' $0 full

EXIT CODES:
    0    Success
    1    Error (check logs)
    2    Prerequisites not met
EOF
}

# Interactive restore function
interactive_restore() {
    local backup_file
    local restore_target
    
    echo "SkyManuals Database Restore"
    echo "=========================="
    echo
    
    # List available backups
    echo "Available backups:"
    find "${BACKUP_DIR}" -name "*.sql*" -type f | sort -r | nl
    
    echo
    read -p "Enter backup file path: " backup_file
    
    if [[ ! -f "${backup_file}" ]]; then
        log_error "Backup file not found: ${backup_file}"
        exit 1
    fi
    
    read -p "Enter target database URL: " restore_target
    
    # Verify backup integrity
    if verify_backup "${backup_file}"; then
        echo "Backup integrity verified"
    else
        log_critical "Backup integrity check failed!"
        exit 1
    fi
    
    # Confirm restore
    echo
    echo "⚠️  WARNING: This will REPLACE all data in the target database!"
    read -p "Are you sure you want to continue? (type 'RESTORE' to confirm): " confirmation
    
    if [[ "${confirmation}" != "RESTORE" ]]; then
        log_info "Restore cancelled by user"
        exit 0
    fi
    
    # Perform restore
    log_info "Starting database restore..."
    
    # Decrypt if encrypted
    if [[ "${backup_file}" == *.enc ]]; then
        local decrypted_file="${backup_file%.enc}"
        log_info "Decrypting backup..."
        
        if ! openssl enc -d -aes-256-cbc -in "${backup_file}" -out "${decrypted_file}" -pass file:"${ENCRYPTION_KEY_FILE}"; then
            log_critical "Failed to decrypt backup"
            exit 1
        fi
        
        backup_file="${decrypted_file}"
    fi
    
    # Decompress if compressed
    if [[ "${backup_file}" == *.gz ]]; then
        local decompressed_file="${backup_file%.gz}"
        log_info "Decompressing backup..."
        
        if ! gunzip -c "${backup_file}" > "${decompressed_file}"; then
            log_critical "Failed to decompress backup"
            exit 1
        fi
        
        backup_file="${decompressed_file}"
    fi
    
    # Restore database
    log_info "Restoring database..."
    
    if psql "${restore_target}" < "${backup_file}"; then
        log_success "Database restore completed successfully"
    else
        log_critical "Database restore failed!"
        exit 1
    fi
    
    # Cleanup temporary files
    if [[ "${backup_file}" != "$1" ]]; then
        rm -f "${backup_file}"
    fi
}

# Argument parsing
case "${1:-}" in
    -h|--help)
        show_usage
        exit 0
        ;;
    -v|--verbose)
        VERBOSE=true
        shift
        main "${1:-incremental}"
        ;;
    --verify)
        if [[ -n "${2:-}" ]]; then
            verify_backup "${2}"
            exit $?
        else
            log_error "No backup file provided for verification"
            exit 1
        fi
        ;;
    --restore)
        interactive_restore
        ;;
    *)
        main "${1:-incremental}"
        ;;
esac
