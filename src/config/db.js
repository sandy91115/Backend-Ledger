const mongoose = require("mongoose")

function connectToDB(){
    console.log('MONGO_URI from env:', process.env.MONGO_URI);
    mongoose.connect(process.env.MONGO_URI)
    .then(() =>{
        console.log("server is connect to DB")
    })
    .catch(err=>{
        console.log("Error connecting to DB", err)
        process.exit(1)
    })
}

module.exports = connectToDB