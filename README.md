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
- **Device-Based Sessions**: No account required - preferences stored per device
- **Responsive Design**: Works well on all screen sizes

### Performance & Reliability
- **Intelligent Caching**: Multi-layer caching reduces API costs and improves speed
- **Rate Limiting**: Built-in protection against API abuse
- **Error Handling**: Graceful fallbacks when services are unavailable
- **Database Monitoring**: PostgreSQL connection and performance tracking

## 🛠 Technology Stack

**Frontend**: React + TypeScript, TailwindCSS, Shadcn/ui, Wouter routing  
**Backend**: Express.js + TypeScript, PostgreSQL, Drizzle ORM  
**AI Services**: OpenAI GPT-4o for recommendations and descriptions  
**Infrastructure**: Vite build tool, Winston logging, Device-based auth  
**Deployment**: Vercel (Frontend & API), PostgreSQL database

## 🚀 Quick Setup

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (local or cloud)
- OpenAI API key

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
   # See Environment Configuration section below for all variables
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

#### Vercel Deployment (Recommended)

1. **Deploy to Vercel**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy
   vercel
   ```

2. **Configure Environment Variables**
   In your Vercel dashboard, add all required environment variables (see Environment Configuration below)

## 🔐 Environment Configuration

### Required Variables

Create a `.env` file with these required variables:

```env
# Database (Required)
DATABASE_URL=postgresql://user:password@host:port/database

# OpenAI API (Required for AI features)
OPENAI_API_KEY=sk-your_openai_key_here

# Optional: Google Vision API (minimal implementation)
GOOGLE_VISION_API_KEY=your_google_vision_key
```

### API Key Setup

**OpenAI API** (Required - for book summaries and recommendations):
1. Visit [OpenAI Platform](https://platform.openai.com)
2. Create an account and add billing
3. Generate an API key in the API Keys section

**Google Vision API** (Optional - limited implementation):
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
│   │   └── layout/        # Navigation and layout
│   ├── pages/             # Application routes/pages
│   ├── hooks/             # Custom React hooks
│   ├── contexts/          # React contexts (Theme, Device)
│   └── lib/               # Utilities and API clients
├── server/                # Express.js backend
│   ├── routes.ts          # Main API routes
│   ├── books.ts           # Book data services
│   ├── openai-*.ts        # AI integration services
│   ├── book-cache-service.ts # Caching layer
│   ├── storage.ts         # Database operations
│   └── middleware/        # Express middleware
├── shared/                # Shared TypeScript types
│   └── schema.ts          # Database schema definitions
├── api/                   # Vercel API routes
├── public/                # Static assets
├── tests/                 # Test files
└── scripts/               # Utility scripts
```

## 🔍 How It Works

### 1. Book Detection
- Users photograph bookshelves using their device camera
- Image is processed to extract text from book spines
- Custom parsing algorithms identify book titles and authors
- Book metadata fetched from external APIs

### 2. Data Enhancement
- Basic book metadata fetched from Google Books API
- OpenAI generates rich summaries and enhanced ratings
- All data cached in PostgreSQL for performance

### 3. Personalized Recommendations
- Users can import reading history from Goodreads CSV export
- Users can manually input reading preferences
- AI analyzes user's reading patterns and preferences
- Generates personalized match scores with detailed reasoning

### 4. Smart Caching
- **Database Layer**: Stores enhanced book data permanently
- **Rate Limiting**: Prevents expensive API overuse
- **Device Identification**: Preferences linked to device cookies

## 📊 Performance Features

- **Lazy Loading**: Images and data load as needed
- **Request Batching**: Efficient API usage
- **Progressive Enhancement**: App works even if AI services are down
- **Caching Strategy**: Multi-level caching reduces costs

## 🛡 Security & Privacy

- **Device-Based Storage**: Reading preferences stored per device, no accounts required
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
npm run test:client     # Client-side tests (Vitest)
npm run test:server     # Server-side tests (Jest)
npm run test:e2e        # End-to-end tests (Playwright)
npm run test:ui         # Test UI

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint issues
npm run security:check  # Security audit

# Production
npm run build           # Build for production
npm start               # Start production server
```

## 📈 Admin Features

Basic admin functionality is available at `/admin` for monitoring:
- API usage statistics
- Basic system information
- Debug information

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
