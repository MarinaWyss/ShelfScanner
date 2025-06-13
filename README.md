# ShelfScanner 📚

**Never leave a bookstore empty-handed again!**

Have you ever been at a book sale, library, or friend's house looking at shelves of books but didn't recognize any titles or authors? ShelfScanner solves the problem of figuring out what to read by using AI to help you discover what you'll enjoy.

[ShelfScanner.io](https://shelfscanner.io/)

## What It Does

📸 **Scan Shelves** → Take a photo of an entire bookshelf  
🤖 **AI Analysis** → Get book recommendations based on your reading preferences  
📖 **Rich Details** → View AI-generated summaries, ratings, and match reasoning  
📚 **Build Lists** → Save interesting books to your reading list  
🛒 **Easy Purchase** → Direct links to buy books on Amazon if you're not at a store

## Key Features

### Smart Book Discovery
- **Shelf Scanning**: Photograph entire bookshelves to identify multiple books at once
- **AI Recommendations**: Personalized suggestions based on your Goodreads data and preferences
- **Match Reasoning**: Understand exactly why each book is recommended for you
- **Enhanced Metadata**: Rich book information with AI-generated summaries and ratings

### User Experience
- **Mobile-First Design**: Optimized for smartphones and tablets
- **Progressive Web App**: Install on your device for native app-like experience
- **Offline Capability**: Access cached book data without internet

### Performance & Reliability
- **Intelligent Caching**: Multi-layer caching reduces API costs and improves speed
- **Rate Limiting**: Built-in protection against API abus
- **Error Handling**: Graceful fallbacks when services are unavailable
- **Database Monitoring**: PostgreSQL connection and performance tracking

## 🛠 Technology Stack

**Frontend**: React + TypeScript, TailwindCSS, Shadcn/ui, Wouter routing  
**Backend**: Express.js + TypeScript, PostgreSQL, Drizzle ORM  
**AI Services**: OpenAI GPT-4, Google Vision API  
**Infrastructure**: Vite build tool, Winston logging, Session auth  
**Deployment**: Vercel (Frontend & API), PostgreSQL database

## 🚀 Quick Setup

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (local or cloud)
- OpenAI API key
- Google Vision API key

### Local Development

1. **Clone and Install Dependencies**
   ```bash
   git clone <your-repo-url>
   cd ShelfScanner
   npm install
   ```

2. **Set Up Environment Variables**
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials (see Environment Configuration below)
   ```

3. **Database Setup**
   ```bash
   # Push the database schema
   npm run db:push:dev
   
   # Optional: Set up initial schemas/data
   npm run db:setup
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5000`

### Production Deployment

#### Option 1: Vercel (Recommended)

1. **Deploy to Vercel**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy
   vercel
   ```

2. **Configure Environment Variables**
   In your Vercel dashboard, add all required environment variables (see Environment Configuration below)

#### Option 2: Docker Deployment

1. **Build Production Bundle**
   ```bash
   npm run build
   ```

2. **Start Production Server**
   ```bash
   npm start
   ```

## 🔐 Environment Configuration

### Required Variables

Create a `.env` file with these required variables:

```env
# Database (Required)
DATABASE_URL=postgresql://user:password@host:port/database

# Admin Access (Required)
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=your_hashed_password

# API Keys (Optional but recommended)
OPENAI_API_KEY=sk-your_openai_key_here
GOOGLE_VISION_API_KEY=your_google_vision_key

# Monitoring & Alerting (Required for production alerts)
SMTP_SMARTHOST=smtp.gmail.com:587
SMTP_FROM=alerts@yourdomain.com
SMTP_AUTH_USERNAME=your_email@gmail.com
SMTP_AUTH_PASSWORD=your_app_password
ADMIN_EMAIL=your_email@gmail.com
HOST=https://yourdomain.com
```

### Monitoring & Alerting Setup

**Email Alerts Configuration:**
```env
# Gmail SMTP (recommended)
SMTP_SMARTHOST=smtp.gmail.com:587
SMTP_FROM=alerts@yourdomain.com
SMTP_AUTH_USERNAME=your_email@gmail.com
SMTP_AUTH_PASSWORD=your_gmail_app_password
ADMIN_EMAIL=your_email@gmail.com

# Alternative SMTP providers
# SendGrid: smtp.sendgrid.net:587
# AWS SES: email-smtp.us-east-1.amazonaws.com:587
# Mailgun: smtp.mailgun.org:587
```

**Alert Types:**
- **Critical System Health**: Memory >90%, CPU >90%, Disk >95%
- **API Rate Limits**: OpenAI/Google APIs approaching daily limits (80%+)
- **Database Issues**: Connection failures, slow queries
- **API Failures**: Multiple failures affecting users
- **Daily Reports**: System performance summaries

**Alert Frequency:**
- Critical alerts: 30-minute cooldown
- Warning alerts: 60-minute cooldown
- Rate limit alerts: Once per day per API
- Daily summaries: 12:00 AM system time

### Generating Admin Password Hash

```javascript
// Run this in Node.js to generate your password hash
const crypto = require('crypto');
const password = 'your_secure_password';
const hash = crypto.createHash('sha256').update(password).digest('hex');
console.log('ADMIN_PASSWORD_HASH=' + hash);
```

### API Key Setup

**OpenAI API** (for book summaries and recommendations):
1. Visit [OpenAI Platform](https://platform.openai.com)
2. Create an account and add billing
3. Generate an API key in the API Keys section

**Google Vision API** (for book spine text recognition):
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable the Vision API
3. Create credentials and get your API key

## 📁 Project Architecture

```
ShelfScanner/
├── client/src/              # React frontend
│   ├── components/         # Reusable UI components
│   │   ├── ui/            # Shadcn/ui base components
│   │   ├── book-scanner/  # Book scanning interface
│   │   └── admin/         # Admin dashboard
│   ├── pages/             # Application routes/pages
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Utilities and API clients
├── server/                # Express.js backend
│   ├── routes.ts          # Main API routes
│   ├── admin-*.ts         # Admin authentication & monitoring
│   ├── book-*.ts          # Book data services
│   ├── openai-*.ts        # AI integration services
│   └── storage.ts         # Database operations
├── shared/                # Shared TypeScript types
│   └── schema.ts          # Database schema definitions
├── public/                # Static assets
├── tests/                 # Test files
└── scripts/               # Utility scripts
```

## 🔍 How It Works

### 1. Book Detection
- Users photograph bookshelves using their device camera
- Google Vision API extracts text from book spines
- Custom parsing algorithms identify book titles and authors

### 2. Data Enhancement
- Basic book metadata fetched from multiple book APIs
- OpenAI generates rich summaries and ratings
- All data cached in PostgreSQL for performance

### 3. Personalized Recommendations
- Users import reading history from Goodreads or manually input preferences
- AI analyzes user's reading patterns and preferences
- Generates personalized match scores with detailed reasoning

### 4. Smart Caching
- **Database Layer**: Stores enhanced book data permanently
- **Memory Cache**: Frequently accessed data for speed
- **API Rate Limiting**: Prevents expensive API overuse

## 📊 Performance Features

- **Lazy Loading**: Images and data load as needed
- **Request Batching**: Multiple book lookups in single API calls
- **Progressive Enhancement**: App works even if AI services are down
- **Offline Support**: Cached data accessible without internet

## 🛡 Security & Privacy

- **No Personal Data Storage**: Reading preferences stored locally or optionally in session
- **Secure Admin Access**: SHA-256 hashed passwords, session-based auth
- **API Key Protection**: All sensitive keys in environment variables
- **Input Validation**: Zod schemas validate all user inputs
- **Rate Limiting**: Prevents API abuse and reduces costs

## 🧪 Development Scripts

```bash
# Development
npm run dev              # Start development server
npm run check           # TypeScript type checking

# Database
npm run db:push         # Push schema to database
npm run db:push:dev     # Push schema (development)
npm run db:push:prod    # Push schema (production)
npm run db:studio       # Open Drizzle Studio
npm run db:generate     # Generate migrations
npm run db:setup        # Initial database setup

# Testing
npm run test            # Run all tests
npm run test:client     # Client-side tests
npm run test:server     # Server-side tests
npm run test:e2e        # End-to-end tests
npm run test:ui         # Test UI

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint issues
npm run security:check  # Security audit

# Production
npm run build           # Build for production
npm start               # Start production server
```

## 📈 Monitoring & Admin

Access the admin dashboard at `/admin` to monitor:
- API usage and costs
- System health and performance
- Error rates and logs
- User activity patterns

## 📄 License

**All Rights Reserved** - This project is proprietary software owned by the author.

- ✅ **Viewing**: You may view the source code for educational purposes
- ✅ **Learning**: You may study the implementation and techniques used
- ❌ **Commercial Use**: Commercial use is strictly prohibited
- ❌ **Distribution**: You may not distribute, modify, or create derivative works
- ❌ **Deployment**: You may not deploy this application for public or commercial use

For any licensing inquiries or permission requests, please contact shelfscannerapp@gmail.com

## 🆘 Support

- **Issues**: Create a GitHub issue for bugs or feature requests
- **Email**: shelfscannerapp@gmail.com

---

**Built with ❤️ for book lovers who want to discover their next great read!**
