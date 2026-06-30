const express = require("express")
const authController = require("../controllers/auth.controller")


const router = express.Router()

router.get("/google/client-id", authController.googleClientConfigController)

router.post("/register", authController.userRegisterController)

router.post("/login", authController.userLoginController)

router.post("/google", authController.userGoogleLoginController)

router.post("/logout", authController.userLogoutController)

module.exports = router
