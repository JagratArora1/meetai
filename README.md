# MeetAI

MeetAI is a modern web application that enables AI-powered meetings and conversations. Create, manage, and enhance your meetings with intelligent AI agents.

## Features

- 🤖 **AI Agents**: Create and customize AI agents with specific instructions for different meeting purposes
- 📅 **Meeting Management**: Schedule, track, and manage meetings with AI agents
- 🎥 **Video Integration**: Built-in video conferencing capabilities using Stream Video
- 💬 **Chat Support**: Real-time chat functionality using Stream Chat
- 📝 **Meeting Records**: Access meeting transcripts, recordings, and AI-generated summaries
- 🔐 **Authentication**: Secure user authentication and session management
- 💾 **Database**: PostgreSQL database with Drizzle ORM for data management

## Getting Started

1. Clone the repository
2. Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Set up your environment variables (`.env` file):

```env
# Database
DATABASE_URL=your_database_url

# Auth
AUTH_SECRET=your_auth_secret

# Stream
STREAM_API_KEY=your_stream_api_key
STREAM_API_SECRET=your_stream_secret

# Other configurations...
```

4. Push the database schema:

```bash
npm run db:push
```

5. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with React 19
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication**: [@polar-sh/better-auth](https://github.com/polarsource/polar)
- **Video/Chat**: [Stream](https://getstream.io/)
- **Styling**: Tailwind CSS with [shadcn/ui](https://ui.shadcn.com/)
- **State Management**: [TanStack Query](https://tanstack.com/query)
