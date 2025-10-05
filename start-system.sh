#!/bin/bash

# SkyManuals System Startup Script
# Starts Backend API, BFF, and serves Frontend applications

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting SkyManuals System${NC}"
echo "=================================="

# Function to print status
print_status() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    print_success "Dependencies check completed"
}

# Install BFF dependencies
setup_bff() {
    print_status "Setting up BFF..."
    
    cd bff
    
    if [ ! -d "node_modules" ]; then
        print_status "Installing BFF dependencies..."
        npm install
    fi
    
    cd ..
    print_success "BFF setup completed"
}

# Start Backend API (simplified version)
start_backend() {
    print_status "Starting Backend API..."
    
    cd apps/api
    
    # Start the simplified backend
    node start-basic.js &
    BACKEND_PID=$!
    
    # Wait for backend to start
    sleep 3
    
    # Check if backend is running
    if curl -s http://localhost:3001/health > /dev/null; then
        print_success "Backend API started on port 3001"
    else
        print_error "Failed to start Backend API"
        exit 1
    fi
    
    cd ../..
}

# Start BFF
start_bff() {
    print_status "Starting BFF..."
    
    cd bff
    
    # Start BFF server
    node server.js &
    BFF_PID=$!
    
    # Wait for BFF to start
    sleep 3
    
    # Check if BFF is running
    if curl -s http://localhost:3002/health > /dev/null; then
        print_success "BFF started on port 3002"
    else
        print_error "Failed to start BFF"
        exit 1
    fi
    
    cd ..
}

# Start Frontend servers
start_frontend() {
    print_status "Starting Frontend servers..."
    
    # Start Upload Frontend
    cd frontend/upload
    python3 -m http.server 3003 &
    UPLOAD_PID=$!
    cd ../..
    
    # Start Viewer Frontend
    cd frontend/viewer
    python3 -m http.server 3004 &
    VIEWER_PID=$!
    cd ../..
    
    sleep 2
    print_success "Frontend servers started"
    print_status "Upload Frontend: http://localhost:3003"
    print_status "Viewer Frontend: http://localhost:3004"
}

# Create PID file for cleanup
create_pid_file() {
    echo "BACKEND_PID=$BACKEND_PID" > .system_pids
    echo "BFF_PID=$BFF_PID" >> .system_pids
    echo "UPLOAD_PID=$UPLOAD_PID" >> .system_pids
    echo "VIEWER_PID=$VIEWER_PID" >> .system_pids
}

# Display system status
show_status() {
    echo ""
    print_success "SkyManuals System is running!"
    echo ""
    echo -e "${BLUE}📊 System Status:${NC}"
    echo "  🌐 Backend API:  http://localhost:3001"
    echo "  🔗 BFF Gateway:  http://localhost:3002"
    echo "  📤 Upload App:   http://localhost:3003"
    echo "  👁️  Viewer App:  http://localhost:3004"
    echo ""
    echo -e "${BLUE}🔧 Available Endpoints:${NC}"
    echo "  GET  /health - Health check"
    echo "  GET  /api/manuals - List manuals"
    echo "  POST /api/manuals/upload - Upload document"
    echo "  POST /api/search/ask - AI search"
    echo "  GET  /api/workflows - List workflows"
    echo "  GET  /api/tasks - List tasks"
    echo ""
    echo -e "${BLUE}🎮 Frontend Applications:${NC}"
    echo "  🔐 Login Page: http://localhost:3002/frontend/auth/login.html"
    echo "     - User authentication"
    echo "     - Role-based access"
    echo "     - Demo accounts available"
    echo ""
    echo "  📤 Document Upload: http://localhost:3003"
    echo "     - Drag & drop file upload"
    echo "     - PDF/XML support"
    echo "     - Authentication required"
    echo ""
    echo "  👁️  Manual Viewer: http://localhost:3004"
    echo "     - Browse all manuals"
    echo "     - AI-powered search"
    echo "     - Authentication required"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
}

# Cleanup function
cleanup() {
    print_status "Shutting down SkyManuals System..."
    
    if [ -f .system_pids ]; then
        source .system_pids
        
        # Kill all processes
        [ ! -z "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null || true
        [ ! -z "$BFF_PID" ] && kill $BFF_PID 2>/dev/null || true
        [ ! -z "$UPLOAD_PID" ] && kill $UPLOAD_PID 2>/dev/null || true
        [ ! -z "$VIEWER_PID" ] && kill $VIEWER_PID 2>/dev/null || true
        
        rm -f .system_pids
    fi
    
    # Kill any remaining processes on our ports
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    lsof -ti:3002 | xargs kill -9 2>/dev/null || true
    lsof -ti:3003 | xargs kill -9 2>/dev/null || true
    lsof -ti:3004 | xargs kill -9 2>/dev/null || true
    
    print_success "System shutdown completed"
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Main execution
main() {
    check_dependencies
    setup_bff
    start_backend
    start_bff
    start_frontend
    create_pid_file
    show_status
    
    # Keep script running
    while true; do
        sleep 1
    done
}

# Run main function
main "$@"
