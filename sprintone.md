# Sprint 1 Roadmap: Backend Foundation & Core Entities

**Duration**: 1 Week
**Goal**: Establish the microservices architecture, set up the multi-tenant data layer, and implement the core Authentication and Job Management services.

---

## 1. Core Features to Implement (Backend)

During this week, we are strictly focusing on the foundational backend infrastructure. The UI/Frontend will follow once the APIs are stable.

1. **Monorepo Setup & Tooling**
   - Initialize a workspace containing shared packages (types, eslint configs) and separate applications for each microservice.
2. **API Gateway Service**
   - The single entry point for the frontend.
   - Responsible for extracting the `tenantId` from requests (via headers or subdomains) and securely proxying the request to the correct downstream service.
3. **Auth & Tenant Service**
   - Managing user registration and login.
   - Issuing JWTs (JSON Web Tokens) that include the user's `tenantId` and `role`.
   - Basic CRUD for creating a new Tenant (Client).
4. **Job Service**
   - API endpoints to Create, Read, Update, and Delete (CRUD) Job Descriptions.
   - **Crucial Rule**: Every database query in this service *must* enforce the `tenantId` boundary to prevent data leaks.

---

## 2. Libraries & Tech Stack to Learn

To execute this sprint efficiently, the engineering team should familiarize themselves with the following libraries:

### Infrastructure & Validation
* **[Turborepo](https://turbo.build/repo/docs)**: A high-performance build system for Node.js monorepos. Needed to easily manage and run multiple microservices simultaneously.
* **[Zod](https://zod.dev/)**: TypeScript-first schema validation. We will use this to validate all incoming API request bodies (e.g., ensuring a job creation request has a valid string title and array of skills).

### Web Framework & Database
* **[Express.js](https://expressjs.com/)**: The core web framework for all microservices. 
  * *Tip: Learn to use `express-async-errors` to avoid wrapping every controller in try/catch blocks.*
* **[Mongoose](https://mongoosejs.com/)**: MongoDB object modeling. 
  * *Learning Focus: Look into Mongoose **Plugins** or **Discriminators** to automatically inject and enforce the `tenantId` on every query.*

### Authentication
* **[jsonwebtoken (JWT)](https://github.com/auth0/node-jsonwebtoken)**: For creating stateless authentication tokens.
* **[bcryptjs](https://github.com/dcodeIO/bcrypt.js)**: For securely hashing user passwords before storing them in MongoDB.

### API Gateway (Optional but Recommended)
* **[http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware)**: A library to easily set up proxy routing in the Express API Gateway.

---

## 3. Actionable Tasks: What Should Be Done

Here is the day-by-day breakdown for the backend team:

### Days 1-2: Repository & Infrastructure
- [ ] Initialize Turborepo (e.g., `apps/api-gateway`, `apps/auth-service`, `apps/job-service`).
- [ ] Set up shared `packages/tsconfig`, `packages/eslint-config`, and `packages/shared-types`.
- [ ] Provision a MongoDB Atlas cluster (or local Docker container).
- [ ] Set up the Express boilerplate for all 3 services with basic health-check endpoints (`/health`).

### Day 3: Auth & Tenant Service
- [ ] Define the `Tenant` and `User` Mongoose schemas.
- [ ] Implement `POST /auth/register` (creates a Tenant and an Admin User).
- [ ] Implement `POST /auth/login` (verifies password and returns a JWT containing `userId`, `tenantId`, and `role`).
- [ ] Create an Express Middleware (`requireAuth.ts`) that decodes the JWT and attaches the user data to the request object.

### Day 4: API Gateway
- [ ] Configure `http-proxy-middleware` in the API Gateway.
- [ ] Route `/api/auth/*` traffic to the Auth Service.
- [ ] Route `/api/jobs/*` traffic to the Job Service.
- [ ] Implement rate-limiting and global error handling on the Gateway.

### Day 5: Job Service
- [ ] Define the `Job` Mongoose schema (ensure `tenantId` is indexed for performance).
- [ ] Implement `POST /jobs` (Create a job).
- [ ] Implement `GET /jobs` (List jobs, strictly filtered by the user's `tenantId` from the JWT).
- [ ] Write basic unit tests for the Job creation logic using `Jest` and `Supertest`.

### End of Sprint Review
- Ensure Postman/Insomnia collections are created and shared with the team.
- Ensure all services start up together with a single `npm run dev` command via Turborepo.
