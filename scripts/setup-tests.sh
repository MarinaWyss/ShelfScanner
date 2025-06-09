#!/bin/bash

# ShelfScanner Test Setup Script
# This script installs test dependencies and sets up the testing environment

set -e

echo "🧪 Setting up ShelfScanner testing environment..."

# Install test dependencies
echo "📦 Installing test dependencies..."
npm install

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install

# Create test environment file if it doesn't exist
if [ ! -f ".env.test" ]; then
    echo "📝 Creating test environment file..."
    cat > .env.test << EOF
# Test Environment Configuration
NODE_ENV=test

# Test Database - Use in-memory or test-specific database
DATABASE_URL=postgresql://test:test@localhost:5432/shelfscanner_test

# Mock API Keys for testing
OPENAI_API_KEY=test_openai_key
GOOGLE_VISION_API_KEY=test_google_vision_key

# Admin credentials for testing
ADMIN_USERNAME=testadmin
ADMIN_PASSWORD_HASH=test_hash

# Test-specific settings
SESSION_SECRET=test_session_secret
PORT=5001
EOF
    echo "✅ Created .env.test file"
else
    echo "ℹ️  .env.test already exists"
fi

# Create test directories if they don't exist
echo "📁 Creating test directory structure..."
mkdir -p tests/setup
mkdir -p tests/server
mkdir -p tests/client/components
mkdir -p tests/e2e
mkdir -p tests/utils

# Create gitignore entries for test artifacts
if ! grep -q "# Test artifacts" .gitignore; then
    echo "📝 Adding test artifacts to .gitignore..."
    cat >> .gitignore << EOF

# Test artifacts
/coverage/
/test-results/
/playwright-report/
/test-results-*/
*.log
.env.test.local
EOF
fi

# Run a quick test to verify setup
echo "🔧 Verifying test setup..."

# Check if TypeScript compilation works
echo "  - Checking TypeScript compilation..."
npm run check

# Run a simple test command to verify Jest is working
echo "  - Verifying Jest setup..."
npx jest --version > /dev/null && echo "    ✅ Jest is ready"

# Run a simple test command to verify Vitest is working
echo "  - Verifying Vitest setup..."
npx vitest --version > /dev/null && echo "    ✅ Vitest is ready"

# Run a simple test command to verify Playwright is working
echo "  - Verifying Playwright setup..."
npx playwright --version > /dev/null && echo "    ✅ Playwright is ready"

echo ""
echo "🎉 Test environment setup complete!"
echo ""
echo "Available test commands:"
echo "  npm run test              # Run all Vitest tests"
echo "  npm run test:server       # Run Jest server tests"
echo "  npm run test:client       # Run Vitest client tests"
echo "  npm run test:e2e          # Run Playwright e2e tests"
echo "  npm run test:coverage     # Run tests with coverage"
echo "  npm run test:ui           # Launch interactive test UI"
echo "  npm run test:all          # Run all test suites"
echo ""
echo "For more information, see TESTING.md"
echo ""
echo "To run your first test:"
echo "  npm run test:server" 