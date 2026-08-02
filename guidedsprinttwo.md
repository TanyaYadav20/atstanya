# Guided Sprint 2: Building the AI Engine

**Objective**: By the end of this week, the team will demonstrate a fully functional ATS flow: A candidate applies, uploads a resume, and the AI automatically scores them against the Job Description.

This guide provides the exact execution path for the "Candidates & AI" team.

---

## Day 1: Mongoose Relationships & Applications

**The Goal**: Understand how to link Candidates to Jobs.

### 📚 What to Learn Today
1. **Mongoose Populate**: Read about [Populate](https://mongoosejs.com/docs/populate.html). This is how you join documents in MongoDB (e.g., getting Candidate details from an Application ID).

### 🛠️ Guided Action
*Work in `apps/candidate-service` today.*
1. **The Schemas**: 
   - `Candidate`: Name, email, phone, `tenantId`.
   - `Application`: Links a `candidateId`, `jobId`, `tenantId`, and `status` (e.g., "Applied").
2. **Apply Endpoint (`POST /candidates/apply`)**:
   - For now, accept a JSON body: `{ "name": "John", "email": "john@test.com", "jobId": "123" }`.
   - Ensure you grab the `tenantId` from the Job they are applying for, or the API request headers.
   - Save the Candidate, then save the Application.

---

## Day 2: Conquering File Uploads

**The Goal**: Accept actual PDF/Word documents via the API.

### 📚 What to Learn Today
1. **Multer**: Read the [Multer documentation](https://github.com/expressjs/multer#readme). Pay close attention to `diskStorage`.

### 🛠️ Guided Action
*Work in `apps/candidate-service` today.*
1. **Setup Multer**: In your Express router, configure multer to save files temporarily to a `/tmp/uploads` folder.
   ```javascript
   const upload = multer({ dest: 'uploads/' })
   router.post('/apply', upload.single('resume'), (req, res) => { ... })
   ```
2. **Update the Endpoint**: 
   - Modify your `POST /candidates/apply` to accept `multipart/form-data`.
   - Extract the file path from `req.file.path`.
   - Create a `Resume` document in MongoDB storing this `fileUrl` and link it to the Candidate.

---

## Day 3: The Gemini AI Magic

**The Goal**: Write the Prompt Engineering logic to parse a resume and score it.

### 📚 What to Learn Today
1. **Gemini SDK**: Read the [Google Gen AI SDK Quickstart](https://ai.google.dev/gemini-api/docs/get-started/tutorial?lang=node).
2. **JSON Mode**: Learn how to force the AI to return JSON using `responseSchema` or System Instructions.

### 🛠️ Guided Action
*Work in `apps/ai-service` today.*
1. **Initialize SDK**: Add your `GEMINI_API_KEY` to the `.env` file and initialize the `GoogleGenerativeAI` client.
2. **The Golden Prompt**: Create a function `analyzeCandidate(jobDescription, resumeText)`. Use this specific prompt structure:
   > "You are an expert technical recruiter. Compare the following Resume against the Job Description. Return a JSON object with exactly three keys: 'matchScore' (an integer from 0 to 100 representing the fit), 'missingSkills' (an array of strings showing critical skills in the JD missing from the resume), and 'summary' (a 2-sentence explanation of your score)."
3. **Internal API**: Expose this function via a `POST /internal/analyze` endpoint.

---

## Day 4: Orchestration (Tying it together)

**The Goal**: Make the Candidate Service talk to the AI Service.

### 📚 What to Learn Today
1. **Inter-Service HTTP Calls**: Understand how one microservice calls another using Axios.

### 🛠️ Guided Action
1. **Trigger AI**: Go back to `apps/candidate-service`'s `POST /candidates/apply` endpoint.
2. **The Workflow**:
   - *Step 1*: File is uploaded & Candidate is saved.
   - *Step 2*: Fetch the target Job Description (you may need to make an HTTP call to the Job Service to get the text!).
   - *Step 3*: Send the Job Description and the Resume file to the AI Service (`POST http://localhost:3003/internal/analyze`).
   - *Step 4*: Wait for the JSON response from Gemini.
   - *Step 5*: Save the `matchScore` and `missingSkills` into an `AI_Analysis` MongoDB collection linked to the Application.
3. **Dashboard Endpoint**: Create a `GET /applications/:jobId` endpoint that returns a list of all applicants for a job, sorted by `matchScore` in descending order!

---

### 🎉 Friday Afternoon: The AI Stakeholder Demo

This is where you WOW the stakeholders with the AI capabilities.

**Your Postman Demo Script:**
1. **The Setup**: Ensure "Client A" is logged in and has created a Job for a "React TypeScript Developer". Show them the Job Description.
2. **The Bad Candidate**: Upload a resume (via Postman form-data) for a "Java Backend Developer". 
   - Fetch the Application list.
   - *Show the stakeholders*: The AI gave them a 15% Match Score and listed "React" and "TypeScript" as Missing Skills.
3. **The Perfect Candidate**: Upload a resume for a Senior React Developer.
   - Fetch the Application list.
   - *Show the stakeholders*: The candidate automatically appears at the top of the list with a 95% Match Score.

This proves that the ATS actually saves recruiters time by bubbling the best candidates to the top instantly!
