# AI Orchestrator Architecture

## Overview

The AI Orchestrator is built with **JavaScript/Node.js** using **LangChain** — there are no Python files in this project.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER (Chat Input)                                 │
│              "Add student Taskeen in Class 5, parent Ikhlas"              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ONE ORCHESTRATOR AGENT (LLM)                           │
│                                                                          │
│   • Model: Groq llama-3.1-8b-instant                                     │
│   • Decides: Which tool(s) to call based on user message                 │
│   • Can call multiple tools in sequence (e.g., get_classrooms → add_student)│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │   TOOL    │   │   TOOL    │   │   TOOL    │
            │ add_student│   │get_students│   │get_classrooms│
            └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                  │               │               │
                  ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ student   │   │ student   │   │ classroom │
            │ Service   │   │ Service   │   │ Service   │
            └───────────┘   └───────────┘   └───────────┘
```

---

## Key Concept: Tools, Not Sub-Agents

We use **tools** (functions), not separate sub-agents. The orchestrator is a single agent that can call any of these tools:

| Tool Name           | What it does                    | Calls                    |
|---------------------|---------------------------------|--------------------------|
| `get_dashboard_stats` | School KPIs                    | dashboardService         |
| `get_students`      | List all students               | studentService           |
| `get_student_profile` | Full profile for one student  | studentService           |
| `get_teachers`      | List teachers                   | teacherService           |
| `get_classrooms`    | List classes                    | classroomService         |
| `get_attention_report` | Students needing attention   | aiService                |
| `get_insights`      | AI insights (defaulters, etc.)  | aiService                |
| `get_student_summary` | AI summary for a student      | aiService + studentService |
| `generate_exam`     | Create AI exam                  | aiService + examService   |
| `get_fee_ledgers`   | Pending fees                    | pool (DB)                |
| `get_exams`         | List exams                      | examService              |
| `add_student`       | Add student + enroll in class   | studentService + enrollmentService |

---

## File Structure

```
server/
├── services/
│   ├── orchestratorService.js   ← Main orchestrator + all tools
│   ├── studentService.js        ← Used by add_student, get_students, etc.
│   ├── classroomService.js      ← Used by get_classrooms, add_student
│   ├── enrollmentService.js    ← Used by add_student
│   ├── aiService.js             ← Used by get_attention_report, generate_exam
│   └── ...
├── routes/
│   └── orchestrator.js          ← POST /orchestrator/chat
└── index.js                     ← Mounts orchestrator route
```

---

## How a Tool Works (Example: add_student)

```javascript
const addStudent = tool(
  async ({ first_name, last_name, guardian_name, class_name }) => {
    // 1. Find classroom by name (e.g. "Class 5")
    const rooms = await classroomService.getAll();
    const match = rooms.find(r => r.name.includes(class_name) || r.grade === class_name);
    
    // 2. Create student
    const student = await studentService.create({
      first_name, last_name, guardian_name
    });
    
    // 3. Enroll in class
    await enrollmentService.create({ student_id: student.id, classroom_id: match.id });
    
    return JSON.stringify({ success: true, student_id: student.id });
  },
  {
    name: "add_student",
    description: "Add a new student and enroll them in a class...",
    schema: z.object({
      first_name: z.string(),
      last_name: z.string(),
      guardian_name: z.string(),
      class_name: z.string(),
    }),
  }
);
```

The LLM reads the description and schema, then decides when to call this tool and with what parameters.

---

## Flow: "Add student Taskeen in Class 5"

1. User sends message → `POST /orchestrator/chat`
2. Orchestrator agent receives: "Add student Taskeen in Class 5, parent Ikhlas"
3. LLM decides to call `add_student` with:
   - first_name: "Taskeen"
   - last_name: "Ikhlas" (or user might mean different split)
   - guardian_name: "Ikhlas"
   - class_name: "Class 5"
4. Tool runs → calls studentService.create + enrollmentService.create
5. Tool returns result to LLM
6. LLM formats a friendly response: "I've added Taskeen Ikhlas to Class 5."

---

## Adding a New Tool

To add a new capability (e.g. `mark_attendance`):

1. Define the tool in `orchestratorService.js`:
```javascript
const markAttendance = tool(
  async ({ student_id, day, status }) => {
    await attendanceService.create({ student_id, day, status });
    return JSON.stringify({ success: true });
  },
  { name: "mark_attendance", description: "...", schema: z.object({...}) }
);
```

2. Add it to the tools array in `createAgent({ tools: [..., markAttendance] })`

3. The LLM will automatically know when to use it based on the description.

---

## Summary

- **Language**: JavaScript/Node.js (no Python)
- **Framework**: LangChain (JS)
- **Structure**: 1 orchestrator agent + many tools
- **Tools** = functions that call existing services (studentService, aiService, etc.)
- **Location**: `server/services/orchestratorService.js`
