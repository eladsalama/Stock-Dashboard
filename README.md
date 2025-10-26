# 📈 Stock Dashboard — Production-Grade Stock Portfolio Platform

> **A comprehensive full-stack portfolio management SaaS showcasing enterprise-level backend engineering, cloud architecture, and modern development practices.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)](https://nodejs.org/)
[![AWS](https://img.shields.io/badge/AWS-Cloud_Native-orange?logo=amazon-aws)](https://aws.amazon.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-blue?logo=docker)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red?logo=redis)](https://redis.io/)

Built by [Elad Salama](https://www.linkedin.com/in/eladsalama) 

---
https://github.com/user-attachments/assets/0f379f46-066b-4bcc-bf35-172881592358

## Project Overview

Stock Dashboard lets users:
- Track investment portfolios and positions
- Upload trades as CSV (S3 presigned upload → SQS → worker)
- Fetch real-time market data, live quotes and historical OHLCV with Redis-backed caching
- View a responsive dashboard in Next.js

<details open>
  <summary><b>Architecture Overview</b> (click to collapse)</summary>

  <p align="center">
    <img
      alt="Stock Dashboard"
      src="https://github.com/user-attachments/assets/7df10df8-bd8f-421f-8777-a924c9819479"
      width="700"
    />
  </p>
</details>


## Quick Start

### **Prerequisites**
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Docker** & Docker Compose ([Download](https://www.docker.com/))
- **Git** ([Download](https://git-scm.com/))

### **1. Clone & Install**
```bash
git clone https://github.com/eladsalama/Stock-Dashboard.git
cd Stock-Dashboard
npm install
cd web && npm install && cd ..
```

### **2. Start Infrastructure (PostgreSQL + Redis + LocalStack)**
```bash
docker-compose up -d
# Postgres: localhost:5432 | Redis: localhost:6379 | LocalStack: localhost:4566
```

### **3. Database Setup**
```bash
npx prisma migrate deploy
npx prisma db seed  # (Optional) Seed sample data
```

### **4. Configure Environment**
Create `.env` in the root directory:

```bash
cp .env.example .env  # (Mac/Linux)
Copy-Item .env.example .env  # (Windows PowerShell)
```


### **5. Start Services**
```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Worker (CSV ingestion)
npm run dev:worker

# Terminal 3: Frontend
cd web && npm run dev
```

### **6. Access the Application**
- **Frontend:** http://localhost:3100
- **API:** http://localhost:3000
- **Health Check:** http://localhost:3000/healthz

---

## 🎓 Key Learning Outcomes

This project demonstrates:

### **Backend Engineering**
- RESTful API design with proper HTTP semantics
- Schema-driven development (Prisma + Zod)
- Async processing patterns (queues, workers, retries)
- Database modeling and migrations
- Caching strategies (Redis TTL, cache invalidation)
- Error handling, structured logging, health checks, request tracing

### **Cloud Architecture (AWS)**
- S3 presigned URLs for scalable file uploads
- SQS for decoupled async processing
- Event-driven architecture (S3 → SQS → Worker)
- LocalStack for cost-effective local development

### **DevOps & CI/CD**
- Docker containerization
- GitHub Actions pipelines
- Automated testing, linting, type checking, and builds
- Environment-based configuration
- Database migration strategies

### **Software Engineering Best Practices**
- Clean architecture (routes → services → repositories)
- Idempotency and reliability patterns
- Code quality tooling (ESLint, Prettier)
- Comprehensive testing (unit + integration)
- TypeScript strict mode (100% type coverage)

---

Project Structure 📁 detailed at Project_Structure.md, 
API Documentation 📝 detailed at API_Documentation.md
