const express= require("express");
const cookieParser = require("cookie-parser")
const cors = require("cors")


const authRouter = require("./routes/auth.route")
const AccountRouter=  require("./routes/account.route")
const transactionRoutes = require("./routes/transaction.routes")

const app= express();
const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173"
].filter(Boolean)
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}))
app.use(express.json())
app.use(cookieParser())
app.use("/api/auth", authRouter)
app.use("/api/accounts", AccountRouter)
app.use("/api/transactions",transactionRoutes)



module.exports=app;
