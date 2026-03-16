# HIMOTHY PLAYS AND PARLAYS

Welcome to the internal source code for HIMOTHY Plays and Parlays, an elite sports intelligence and research platform.

## Architecture

- **Frontend**: Next.js 14 App Router, Tailwind CSS, Shadcn UI
- **Database**: PostgreSQL with Prisma ORM (Schema inside `prisma/schema.prisma`)
- **Intelligence Engine**: Deep research orchestration in `src/services/researchEngine.ts` and `src/services/scoringModel.ts`
- **Data Pipelines**: `src/services/dataIngestion.ts`

## Setup

Due to the environment constraints during initial scaffolding, the project files have been generated manually.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize the Database:
   Set your `DATABASE_URL` in `.env` and run:
   ```bash
   npx prisma migrate dev --name init
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Design Philosophy
This system is research-first. The AI engine is designed to collect data, grade value, and only output recommendations that meet strict confidence thresholds. Unqualified matches throw a "NO_BET_FLAG" to prevent forced action. The platform manages VIP Packages, Public Free Picks, Parlay Plans, and automated performance tracking.

## Phase 1 Status
- [x] Project Intialization configuration
- [x] Database Schema Design
- [x] Core App Layouts and UI Architecture
- [x] Public Landing Page styled & themed
- [x] Admin Dashboard structure
- [x] Service scaffolding & logic defined
