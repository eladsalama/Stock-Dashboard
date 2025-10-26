## 🔧 **Setup Instructions:**

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable the **Google Identity API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Identity" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Choose "Web application"
   - Add authorized origins:
     - `http://localhost:3100` (for development)
     - Your production domain when ready
   - Copy the **Client ID**

### 2. Environment Configuration

1. **Backend** (`Stock Dashboard/.env`):

   ```env
   GOOGLE_CLIENT_ID=your_google_client_id_here
   DATABASE_URL=your_database_url
   ```

2. **Frontend** (`Stock Dashboard/web/.env.local`):
   ```env
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here
   ```

### 3. Test the Implementation

1. Start the backend: `npm run dev` (from root directory)
2. Start the frontend: `npm run dev` (from web directory)
3. Click the user avatar > "Log in"
4. Try both email/password and Google OAuth
