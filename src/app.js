const express= require("express");
const cookieParser = require("cookie-parser")


const authRouter = require("./routes/auth.route")
const AccountRouter=  require("./routes/account.route")
const transactionRoutes = require("./routes/transaction.routes")

const app= express();
app.use(express.json())
app.use(cookieParser())
app.use("/api/auth", authRouter)
app.use("/api/accounts", AccountRouter)
app.use("/api/transactions",transactionRoutes)



module.exports=app;