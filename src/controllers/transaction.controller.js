const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const emailService= require("../services/email.services")
const accountModel = require("../models/account.model")
const mongoose = require("mongoose")



async function createTransaction(req, res){

    //1.Validate request
    const{fromAmount,toAccount,amount, idempotencyKey} = req.body

    if(!fromAccount || !toAccount || !amount || !idempotencyKey){
       return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        })
    }


    const fromUserAccount = await accountModel.findOne({
        _id: fromAmount,
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

    const balance = await fromUserAccount.getBalance()

    if(balance <amount){
       return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}, Requested amount is ${amount}` 
        })
    }

    //5. Create transaction (Pending)

    const session = await mongoose.startSession()
    session.startTransaction()

    const transaction = await transactionModel.create({
        fromAmount,
        toAccount,
        amount,
        idempotencyKey,
        status: "PENDING"
    },{
        session
    })

    const debitLedgerEntry = await ledgerModel.create({
        account :fromAmount,
        amount:amount,
        transaction : transaction._id,
        type: "DEBIT"
    },{session})
    const creditLedgerEntry = await ledgerModel.create({
        account :toAccount,
        amount:amount,
        transaction : transaction._id,
        type: "CREDIT"
    },{session})

    transaction.status= "COMPLETED"
    await transaction.save({session})

    await session.commitTransaction()
    session.endSession()


    //send email notification

    await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount,fromAmount)
    return res.status(201).josn({
        message: "Transaction completed successfully",
        transaction: transaction
    })

}

module.exports = {
    createTransaction
}