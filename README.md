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
- **Rate Limiting**: Built-in protection against API abuse
- **Health Monitoring**: Real-time system performance tracking
- **Error Handling**: Graceful fallbacks when services are unavailable

## 🛠 Technology Stack

**Frontend**: React + TypeScript, TailwindCSS, Shadcn/ui, Wouter routing  
**Backend**: Express.js + TypeScript, PostgreSQL, Drizzle ORM  
**AI Services**: OpenAI GPT-4, Google Vision API  
**Infrastructure**: Vite build tool, Winston logging, Session auth  

## 🚀 Quick Setup

### Option 1: Deploy on Replit (Easiest)

1. **Fork the Repository**
   ```bash
   # Import this repository into Replit
   # Go to https://replit.com and click "Create Repl" → "Import from GitHub"
   # Use the URL of your forked repository
   ```

2. **Configure Environment Variables**
   In Replit, go to the "Secrets" tab and add:
   ```
   DATABASE_URL=your_postgresql_connection_string
   ADMIN_USERNAME=your_admin_username
   ADMIN_PASSWORD_HASH=your_hashed_password
   OPENAI_API_KEY=your_openai_api_key
   GOOGLE_VISION_API_KEY=your_google_vision_api_key
   ```

3. **Set Up Database**
   Replit includes PostgreSQL. Enable it in your repl and update the DATABASE_URL

4. **Install Dependencies & Run**
   ```bash
   npm install
   npm run db:push
   npm run dev
   ```

### Option 2: Local Development

1. **Clone and Install**
   ```bash
   git clone <your-repo-url>
   cd ShelfScanner
   npm install
   ```

2. **Set Up Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

3. **Database Setup**
   ```bash
   # Set up PostgreSQL locally or use a cloud provider
   npm run db:push
   ```

4. **Start Development Server**
   ```bash
   npm run dev
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
```

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
└── public/                # Static assets
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
