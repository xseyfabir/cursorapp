# Next.js TypeScript Tailwind CSS Project

A modern Next.js application configured with TypeScript and Tailwind CSS, featuring a responsive layout with header, homepage, and Supabase authentication.

## Features

- ⚡ Next.js 14+ with App Router
- 🔷 TypeScript for type safety
- 🎨 Tailwind CSS for styling
- 📱 Responsive design with mobile menu
- 🌙 Dark mode support
- 🔐 Supabase authentication (signup, login, session management)
- 👤 User profile management with 'users' table integration
- 🐦 Twitter OAuth integration with secure token storage
- 🗓️ Scheduled tweets with Supabase storage and cron processing

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a project at [Supabase](https://supabase.com)
2. Get your project URL and anon key from the API settings
3. Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Twitter OAuth (optional, for Twitter integration)
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
TWITTER_REDIRECT_URI=http://localhost:3000/api/auth/twitter/callback
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Set Up Database

Create a `users` table in your Supabase database with the following schema:

```sql
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Create policy to allow users to insert their own data
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create policy to allow users to update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);
```

### 4. Set Up Twitter OAuth (Optional)

If you want to enable Twitter OAuth integration:

1. **Create a Twitter App:**
   - Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
   - Create a new app and get your Client ID and Client Secret
   - Set the callback URL to: `http://localhost:3000/api/auth/twitter/callback` (or your production URL)

2. **Create Twitter Accounts Table:**
   Run this SQL in your Supabase SQL editor:

```sql
CREATE TABLE twitter_accounts (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE twitter_accounts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own tokens
CREATE POLICY "Users can view own twitter accounts" ON twitter_accounts
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own tokens
CREATE POLICY "Users can insert own twitter accounts" ON twitter_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own tokens
CREATE POLICY "Users can update own twitter accounts" ON twitter_accounts
  FOR UPDATE USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own tokens
CREATE POLICY "Users can delete own twitter accounts" ON twitter_accounts
  FOR DELETE USING (auth.uid() = user_id);
```

   **Or use the setup script:** Run `supabase/twitter_accounts_setup.sql` in your Supabase SQL editor for a complete setup with verification.

3. **Create Scheduled Tweets Table (optional, for scheduling):**
   Run this SQL in your Supabase SQL editor:

```sql
CREATE TABLE scheduled_tweets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 280),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'pending',
  posted_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE scheduled_tweets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled tweets" ON scheduled_tweets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled tweets" ON scheduled_tweets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled tweets" ON scheduled_tweets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled tweets" ON scheduled_tweets
  FOR DELETE USING (auth.uid() = user_id);
```

   **Or use the setup script:** Run `supabase/scheduled_tweets_setup.sql` in your Supabase SQL editor.

4. **Scheduled Tweets Cron**
   - Endpoint: `GET /api/cron/scheduled-tweets`
   - Env vars required:
     - `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never expose to client)
     - `CRON_SECRET` (optional, for manual/external cron calls)
   
   **Vercel Cron Setup (Recommended):**
   - The `vercel.json` file is already configured to run the cron job every minute
   - Vercel automatically executes the cron job when deployed
   - No additional setup needed - Vercel handles authentication via `x-vercel-cron` header
   
   **Manual/External Cron Setup:**
   - For external cron services, call the endpoint with the CRON_SECRET:

```bash
curl -X GET https://your-domain.com/api/cron/scheduled-tweets \
  -H "Authorization: Bearer $CRON_SECRET"
```

   Or use query parameter:
```bash
curl -X GET "https://your-domain.com/api/cron/scheduled-tweets?secret=$CRON_SECRET"
```

3. **Add Twitter credentials to `.env.local`** (see step 2 above)

### 5. Generate Supabase Types (Optional but Recommended)

Generate TypeScript types from your Supabase database schema:

```bash
# First, login to Supabase CLI
npx supabase login

# Link your project (optional, makes future type generation easier)
npx supabase link --project-ref vgdycmpevjiyfjrbskxf

# Generate types
npm run generate:types
```

This will generate types to `src/lib/supabase.types.ts` based on your current database schema. Run this command whenever you make changes to your database schema.

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
├── app/
│   ├── components/
│   │   ├── Header.tsx      # Responsive header component
│   │   ├── LoginForm.tsx   # Login form component
│   │   ├── SignupForm.tsx  # Signup form component
│   │   └── UserProfile.tsx # User profile component
│   ├── login/
│   │   └── page.tsx        # Login page
│   ├── signup/
│   │   └── page.tsx        # Signup page
│   ├── forgot-password/
│   │   └── page.tsx        # Forgot password page
│   ├── reset-password/
│   │   └── page.tsx        # Reset password page
│   ├── profile/
│   │   └── page.tsx        # User profile page
│   ├── connect-twitter/
│   │   └── page.tsx        # Twitter OAuth connection page
│   ├── compose-tweet/
│   │   └── page.tsx        # Compose and post tweets page
│   ├── schedule-tweet/
│   │   └── page.tsx        # Schedule tweets page
│   ├── api/
│   │   ├── auth/
│   │   │   └── twitter/
│   │   │       ├── route.ts        # Twitter OAuth initiation
│   │   │       └── callback/
│   │   │           └── route.ts    # Twitter OAuth callback handler
│   │   └── cron/
│   │       └── scheduled-tweets/
│   │           └── route.ts        # Cron endpoint to process scheduled tweets
│   │   └── tweets/
│   │       └── post/
│   │           └── route.ts        # API route to post tweets
│   ├── globals.css         # Global styles with Tailwind directives
│   ├── layout.tsx          # Root layout component with AuthProvider
│   └── page.tsx            # Homepage component
├── contexts/
│   └── AuthContext.tsx     # Authentication context provider
├── lib/
│   └── supabase/
│       ├── client.ts       # Browser Supabase client
│       ├── server.ts       # Server Supabase client
│       └── middleware.ts   # Middleware for session management
├── src/
│   └── lib/
│       └── supabase.types.ts # TypeScript types for database (generated by Supabase CLI)
├── middleware.ts           # Next.js middleware for auth
├── next.config.js          # Next.js configuration
├── package.json            # Dependencies and scripts
├── postcss.config.js       # PostCSS configuration
├── tailwind.config.ts      # Tailwind CSS configuration
└── tsconfig.json           # TypeScript configuration
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Authentication

The app includes a complete authentication system:

- **Sign Up**: Create a new account at `/signup`
- **Sign In**: Login at `/login`
- **Profile**: View user profile at `/profile` (requires authentication)
- **Session Management**: Automatic session handling with Supabase
- **User Table**: Integrated with Supabase 'users' table
- **Password Recovery**: Forgot password flow with email reset link

The authentication state is managed globally using React Context and is accessible throughout the app via the `useAuth()` hook.

### Password Recovery

The app includes a password recovery system for users who forget their passwords:

1. **Forgot Password**: Visit `/forgot-password` or click "Forgot password?" on the login page
2. **Enter Email**: User enters their email address
3. **Email Sent**: Supabase sends a password reset email with a secure link
4. **Reset Password**: User clicks the link and is redirected to `/reset-password`
5. **New Password**: User enters and confirms their new password
6. **Password Updated**: User is redirected to login page

**Note**: Make sure to configure your email settings in Supabase to enable password reset emails. The reset link will redirect to your app's `/reset-password` page.

## Twitter OAuth Integration

The app supports Twitter OAuth 2.0 integration:

- **Connect Twitter**: Visit `/connect-twitter` to connect your Twitter account
- **OAuth 2.0 Flow**: Uses Authorization Code Flow with PKCE for security
- **Secure Storage**: Access tokens are stored securely in Supabase, linked to your user account
- **Token Management**: Tokens are stored server-side only and never exposed to the client
- **Row Level Security**: RLS policies ensure users can only access their own tokens

The Twitter OAuth flow:
1. User clicks "Connect Twitter" button
2. Redirects to Twitter for authorization
3. User authorizes the app
4. Callback receives authorization code
5. Server exchanges code for access token
6. Token is securely stored in Supabase `twitter_accounts` table

## Scheduled Tweets

- **Schedule Tweet**: Visit `/schedule-tweet` to create scheduled tweets
- **Storage**: Scheduled tweets are stored in the `scheduled_tweets` table
- **Cron Processing**: `/api/cron/scheduled-tweets` processes due tweets
- **Auth**: Requires connected Twitter account and a valid access token
- **Security**: Cron endpoint protected with `CRON_SECRET` and uses `SUPABASE_SERVICE_ROLE_KEY` on the server

**Vercel Deployment:**
- The `vercel.json` file configures automatic cron execution every minute
- Vercel cron jobs are automatically authenticated and don't require CRON_SECRET
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel environment variables

**Other Platforms:**
- Set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` in environment
- Call `/api/cron/scheduled-tweets` every minute from your scheduler

## Compose Tweet

The app includes a tweet composition feature:

- **Compose Tweet**: Visit `/compose-tweet` to write and post tweets
- **Character Limit**: 280 character limit with real-time counter
- **Twitter Integration**: Uses stored access token to post tweets via Twitter API
- **Error Handling**: Displays success/error messages for tweet posting
- **Account Check**: Requires connected Twitter account before posting

To use the compose tweet feature:
1. Connect your Twitter account at `/connect-twitter`
2. Visit `/compose-tweet` to compose your tweet
3. Enter your tweet (max 280 characters)
4. Click "Post Tweet" to publish

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Twitter OAuth 2.0 Guide](https://developer.twitter.com/en/docs/authentication/oauth-2-0)

# cursorapp
