const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const emailService= require("../services/email.services")
const accountModel = require("../models/account.model")
const mongoose = require("mongoose")



async function createTransaction(req, res){

    //1.Validate request
    const{fromAccount,toAccount,amount, idempotencyKey} = req.body

    if(!fromAccount || !toAccount || !amount || !idempotencyKey){
       return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    if(!mongoose.Types.ObjectId.isValid(fromAccount) || !mongoose.Types.ObjectId.isValid(toAccount)){
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }


    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
        user: req.user._id
    })
    
    const toUserAccount = await  accountModel.findOne({
        _id: toAccount
    })

    if(!fromUserAccount || !toUserAccount){
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }

    //Validate idempotency key
    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    })

    if(isTransactionAlreadyExists){
        if(isTransactionAlreadyExists.status === "COMPLETED"){
            return res.status(200).json({
                message:"Transaction already process",
                transaction: isTransactionAlreadyExists
            })

        }
        if(isTransactionAlreadyExists.status== "PENDING"){
            return res.status(200).json({
                message: "Transaction is still processing",
                transaction: isTransactionAlreadyExists
            })
        }
         if(isTransactionAlreadyExists.status== "FAILED"){
           return res.status(500).json({
                message: "Transaction processing failed",
                transaction: isTransactionAlreadyExists
            })
        }
         if(isTransactionAlreadyExists.status== "REVERSED"){
           return res.status(500).json({
                message: "Transaction was reversed, please retry",
                transaction: isTransactionAlreadyExists
            })
        }

    }

    //Check account status

    if(fromUserAccount.status != "ACTIVE" || toUserAccount.status !=="ACTIVE"){
        return res.status(400).json({
            message : "Both fromAccount and toAccount must be ACTIVE to process transaction"
        })
    }
  

    //4. Derive sender balance from ledger

    const transactionAmount = Number(amount)

    if(!Number.isFinite(transactionAmount) || transactionAmount <= 0){
        return res.status(400).json({
            message: "Amount must be a positive number"
        })
    }

    const balance = await fromUserAccount.getBalance()

    if(balance < transactionAmount){
       return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}, Requested amount is ${transactionAmount}` 
        })
    }

    let transaction
    const session = await mongoose.startSession()
    try{
    //5. Create transaction (Pending)

    session.startTransaction()

     transaction = ( await transactionModel.create([{
        fromAccount,
        toAccount,
        amount: transactionAmount,
        idempotencyKey,
        status: "PENDING"
    }],{
        session
    })) [0]

    const debitLedgerEntry = await ledgerModel.create([{
        account :fromAccount,
        amount: transactionAmount,
        transaction : transaction._id,
        type: "DEBIT"
    }],{session})
    const creditLedgerEntry = await ledgerModel.create([{
        account :toAccount,
        amount: transactionAmount,
        transaction : transaction._id,
        type: "CREDIT"
    }],{session})

    transaction.status= "COMPLETED"
    await transaction.save({session})

    await session.commitTransaction()
    session.endSession()
    } catch(error){
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({
            message: "Transaction is Pending due to some issue, Please try later"
        })
    }

    //send email notification

    await emailService.sendTransactionEmail(req.user.email, req.user.name, transactionAmount, toAccount, fromAccount)
    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    })

}
async function createInitialFundsTransaction(req,res){
    const {toAccount, amount, idempotencyKey}= req.body
    if(!toAccount || !amount || !idempotencyKey){
        return res.status(400).json({
            message :"toAccount, amount and idempotency key are required"
        })
    }

    const toUserAccount = await accountModel.findOne({
        _id:toAccount,
    })

    if(!toUserAccount){
        return res.status(400).json({
            message: "Invalid toAccount"
        })
    }
    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    })
    if(!fromUserAccount){
        return res.status(400).json({
            message:"System user account not found"
        })
    }

    const transactionAmount = Number(amount)

    if(!Number.isFinite(transactionAmount) || transactionAmount <= 0){
        return res.status(400).json({
            message: "Amount must be a positive number"
        })
    }

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey
    })

    if(isTransactionAlreadyExists){
        return res.status(200).json({
            message: "Transaction already processed",
            transaction: isTransactionAlreadyExists
        })
    }

    const session= await mongoose.startSession()
    let transaction

    try{
        session.startTransaction()

        transaction = (await transactionModel.create([{
            fromAccount: fromUserAccount._id,
            toAccount,
            amount: transactionAmount,
            idempotencyKey,
            status: "PENDING"
        }], {
            session
        }))[0]

        await ledgerModel.create([{
            account: fromUserAccount._id,
            amount: transactionAmount,
            transaction: transaction._id,
            type: "DEBIT"
        }], {
            session
        })

        await ledgerModel.create([{
            account: toAccount,
            amount: transactionAmount,
            transaction: transaction._id,
            type: "CREDIT"
        }], {
            session
        })

        transaction.status = "COMPLETED"
        await transaction.save({session})

        await session.commitTransaction()
        session.endSession()
    } catch(error){
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({
            message: "Initial funds transaction failed, please try later"
        })
    }

    return res.status(201).json({
        message:"Initial funds transaction completed successfully",
        transaction: transaction
    })
}

module.exports = {
    createTransaction,createInitialFundsTransaction
}
