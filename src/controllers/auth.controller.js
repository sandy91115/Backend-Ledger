const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const emailService = require("../services/email.services")
const tokenBlackListModel = require("../models/blackList.model")

const googleClient = new OAuth2Client(process.env.CLIENT_ID);

function createToken(user){
  return jwt.sign({userID:user._id}, process.env.JWT_SECRET, {expiresIn:"3d"})
}

function userPayload(user){
  return {
    _id:user._id,
    email: user.email,
    name:user.name
  }
}

function googleClientConfigController(req, res){
  if(!process.env.CLIENT_ID){
    return res.status(404).json({
      message: "Google client id is not configured"
    })
  }

  return res.status(200).json({
    clientId: process.env.CLIENT_ID
  })
}

async function userRegisterController(req, res) {

  const { email, password, name } = req.body;

  const ifExists = await userModel.findOne({
    email:email
  })
  if(ifExists ){
    return res.status(422).json({
        message:"user already exists with email",
        status:"failed"
    })
  }
  const user = await userModel.create({
    email, password,name
  })

  const token = createToken(user)

  res.cookie("token", token)
  res.status(201).json({
    user:userPayload(user),
    token
  })
  await emailService.sendRegistrationEmail(user.email, user.name)
}

async function userLoginController(req, res){
  const {email, password} =req.body
  const user = await userModel.findOne({email}).select("+password")

  if(!user){
    return res.status(401).json({
      message: "Email or password is Invalid"
    })
  }
  const isValidPassword = await user.comparePassword(password)

  if(!isValidPassword){
    return res.status(401).json({
      message:"Email or Password is Invalid"
    })
  }
  
  const token = createToken(user)

  res.cookie("token", token)
  res.status(200).json({
    user:userPayload(user),
    token
  })
}

async function userGoogleLoginController(req, res){
  const { credential } = req.body;

  if(!credential){
    return res.status(400).json({
      message: "Google credential is required"
    })
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.CLIENT_ID,
  })
  const payload = ticket.getPayload()

  if(!payload?.email || !payload.email_verified){
    return res.status(401).json({
      message: "Google account email is not verified"
    })
  }

  let user = await userModel.findOne({email: payload.email})

  if(!user){
    user = await userModel.create({
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      password: crypto.randomBytes(24).toString("hex")
    })
  }

  const token = createToken(user)

  res.cookie("token", token)
  return res.status(200).json({
    user:userPayload(user),
    token
  })
}

async function userLogoutController(req, res){
  const token= req.cookies.token || req.headers.authorization?.split(" ")[1]
  if(!token){
    return res.status(200).json({
      message: "User logged out successfully"
    })
  }
  res.cookie("token", "")
  await tokenBlackListModel.create({
    token:token,
  })
  res.status(200).json({
    message: "User logout successfully"
  })
}
module.exports = {
    googleClientConfigController,
    userRegisterController,
    userLoginController,
    userGoogleLoginController,
    userLogoutController
}
