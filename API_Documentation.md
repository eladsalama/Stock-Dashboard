## 📝 API Documentation

### **Portfolios**
- `GET /v1/portfolios` — List user portfolios
- `POST /v1/portfolios` — Create portfolio
- `GET /v1/portfolios/:id` — Get portfolio details
- `PATCH /v1/portfolios/:id` — Update portfolio
- `DELETE /v1/portfolios/:id` — Delete portfolio

### **Positions**
- `GET /v1/portfolios/:id/positions` — List positions
- `POST /v1/portfolios/:id/positions` — Create/update position
- `DELETE /v1/portfolios/:id/positions/:symbol` — Remove position

### **Quotes & Market Data**
- `GET /v1/quotes/:symbol` — Get real-time quote (cached 60s)
- `GET /v1/quotes/:symbol/history?range=1d` — Historical OHLCV data

### **Uploads**
- `POST /v1/uploads/trades:presign` — Generate S3 presigned URL

### **Ingestion**
- `GET /v1/portfolios/:id/ingests` — List ingestion runs

### **Health**
- `GET /healthz` — Service health check
- `GET /version` — API version info