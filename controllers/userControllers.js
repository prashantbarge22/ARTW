const { compareSync } = require("bcryptjs");
const moment = require('moment');
const request = require('request');
const crypto = require('crypto');
const userServices = require("../services/userServices");
const blockchainServices = require("../services/blockchainServices");
const { mail } = require('../helper/mailer');
const { calculateHours } = require('../helper/userHelper');
const { balanceMainBNB, coinBalanceBNB } = require('../helper/bscHelper');
const { balanceMainETH, coinBalanceETH } = require('../helper/ethHelper');

const sessionHeader = async (req, res, next) => {
    res.locals.session = req.session;
    let user_id = res.locals.session.re_us_id;
    let result = userServices.checkUserId(user_id);
    if (result) {
        res.locals.greet = function () {
            return result;
        }
        res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        next();
    }
    else {
        return null;
    }
}

const logout = async (req, res) => {
    req.session.destroy();
    res.redirect('/login');
}

const landingPage = async (req, res) => {
    let rates = await userServices.getRates();
    if (rates) {
        res.render('front/index', {
            token_values: rates
        });
    }
    else {
        res.render('front/comingsoon');
    }
}

const signupPage = async (req, res) => {
    let err_msg = req.flash('err_msg');
    let success_msg = req.flash('success_msg');
    let ref_link = "";
    if (req.body.ref_link != "" && req.body.ref_link != undefined) {
        ref_link = req.body.ref_link.trim();
    }
    let test = req.session.is_user_logged_in;
    if (test == true) {
        res.redirect('/dashboard');
    } else {
        if (req.query.code) {
            res.render('front/signup', { err_msg, success_msg, layout: false, session: req.session, ref_link: req.query.code });
        } else {
            res.render('front/signup', { err_msg, success_msg, layout: false, session: req.session, ref_link: '' });
        }
    }

}

const loginPage = async (req, res) => {
    let err_msg = req.flash('err_msg');
    let success_msg = req.flash('success_msg');
    let test = req.session.is_user_logged_in;
    if (test == true) {
        res.redirect('/dashboard');
    }
    else {
        res.render('front/login', { err_msg, success_msg, layout: false, session: req.session });
    }
}

const forgotPage = async (req, res) => {
    let err_msg = req.flash('err_msg');
    let success_msg = req.flash('success_msg');
    var test = req.session.is_user_logged_in;
    if (test == true) {
        res.redirect('/dashboard');
    }
    else {
        res.render('front/forgot-pass', { err_msg, success_msg, layout: false, session: req.session, });
    }
}

const verifyPage = async (req, res) => {
    let err_msg = req.flash('err_msg');
    let success_msg = req.flash('success_msg');
    var test = req.session.is_user_logged_in;
    if (test == true) {
        res.redirect('/dashboard');
    } else {
        res.render('front/verify-account', { err_msg, success_msg, layout: false, session: req.session })
    }
}

const submitForgot = async (req, res) => {
    let user = await userServices.checkUser(req.body.email);
    if (!user) {
        req.flash('err_msg', 'Please enter registered Email address.');
        res.redirect('/Forgot-password');
    }
    else {
        let new_pass = Math.random().toString(36).slice(-5);
        let mystr1 = await userServices.createCipher(new_pass);
        let userUpdated = await userServices.updateUserPassword(req.body.email, mystr1);
        if (userUpdated) {
            let subject = 'OTP for changing password.'
            let text = 'Hello ' + req.body.email + ',<br><br>\n\n' +
                'Your one-time password (OTP) for change password is: ' + otp +
                '<br><br>\n\n' + 'This would be valid for only for the next 10 minutes<br><br>\n\n' +
                'If this password change attempt was not made by you it means someone visited your account. It may be an indication you have been the target of a phishing attempt and might want to consider moving your funds to a new wallet.' + '<br><br>\n\n' + 'Regards,<br>\nTheArtW Team<br>\nhttps://theartwcoin.com';
            await mail(req.body.email, subject, text);
            req.flash('success_msg', 'Password has been sent successfully to your registered email.');
            res.redirect('/Forgot-password');
        }
        else {
            req.flash('err_msg', 'Something went wrong.');
            res.redirect('/Forgot-password');
        }
    }
}


const submitUser = async (req, res) => {
    // if(req.body['g-recaptcha-response'] == undefined || req.body['g-recaptcha-response'] == '' || req.body['g-recaptcha-response'] == null){
    //     req.flash('err_msg', 'Please select captcha first.');
    //     res.redirect('/Signup');
    // }
    // else{

    try{
    const secretKey = "6LcQx_AaAAAAAJmTY794kuLiHyURsR_uu-4Wqixg";

    const verificationURL = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;

    request(verificationURL, async function (error, response, body2) {
        console.log(body2)
        let body = JSON.parse(body2);

        if (error && !body.success) {
            req.flash('err_msg', 'Failed captcha verification.');
            res.redirect('/Signup');
        } else {
            let old_user = await userServices.checkUser(req.body.email);
            if (old_user) {
                req.flash('err_msg', 'Email already exists. Please enter another email.');
                res.redirect('/Signup');
            }
            else {
                let ref_link;
                if (req.body.ref_link != "" && req.body.ref_link != undefined) {
                    ref_link = req.body.ref_link.trim();
                } else {
                    ref_link = "";
                }
                if (req.body.password == req.body.conf_pass) {
                    let mystr = await userServices.createCipher(req.body.password);
                    let created = await userServices.createAtTimer();
                    let new_user=await userServices.addUser(req.body, created,mystr);
                    let user = await userServices.checkUser(req.body.email);
                    if (ref_link != "") {
                        let refData = await userServices.referData(user.ref_code, ref_link, user._id, created);
                    }
                    let otp = new_user.otp;
                    req.session.success = true;
                    req.session.re_us_id = user._id;
                    req.session.re_usr_name = user.name;
                    req.session.re_usr_email = user.email;
                    req.session.is_user_logged_in = false;
                    let subject = 'OTP for your new account on TheARTW website';
                    let text = 'Hello ' + req.body.email + ',<br><br>\n\nCongratulations on signing up with TheARTW website!<br><br>\n\n' +
                        'Your one-time password (OTP) for signing up is: ' + otp + '. This would be valid only for the next 10 minutes.' +
                        '<br><br>\n\nOnce you enter the OTP and create a new wallet, we will credit it by 50 ARTW (worth US$50)  as a limited-time joining bonus.<br><br>\n\n' +
                        'Moreover, you can earn more by referring your friends and earn US$10 equivalent ARTW tokens every time your friend joins by using your referral code. Your friend will also get US$10 equivalent ARTW tokens for using your referral code !<br><br>\n\n' +
                        'Time: ' + created + '<br><br>\n\n'
                    'If this withdrawal attempt was not made by you it means someone visited your account. It may be an indication you have been the target of a phishing attempt and might want to consider moving your funds to a new wallet.' + '<br><br>\n\n' + 'Regards,<br>\nTheArtW Team<br>\nhttps://theartwcoin.com';
                    await mail(req.body.email, subject, text);
                    req.flash('success_msg', 'User registered. Please verify to continue.');
                    res.redirect('/Verify_account');
                }
                else {
                    req.flash('err_msg', 'Password does not match.');
                    res.redirect('/Signup');
                }
            }
        }
    })
    //}
}catch(error){
    console.log(error);
}
}

const userLogin = async (req, res) => {
    let user = await userServices.checkUser(req.body.email);
    let password = req.body.password.trim();
    let mystr = await userServices.createCipher(password);
    if (user) {
        let userlogin = await userServices.checkUserPass(req.body.email.trim(), mystr);
        if (userLogin) {
            let status = userlogin.status;
            let email_status = userlogin.email_verify_status;
            if (status == 'active' && email_status == 'verified') {
                req.session.success = true;
                req.session.re_us_id = userlogin._id;
                req.session.re_usr_name = userlogin.name;
                req.session.re_usr_email = userlogin.email;
                req.session.is_user_logged_in = true;
                res.redirect("/dashboard");
            } else {
                req.flash('err_msg', 'Your account is not verified.');
                res.redirect('/login')
            }
        }
        else {
            req.flash('err_msg', 'The username or password is incorrect.');
            res.redirect('/login');
        }
    }
    else {
        req.flash('err_msg', 'Please enter valid Email address.');
        res.redirect('/login');
    }

}

const verifyUser = async (req, res) => {
    let user_otp = req.body.otp;
    let email = req.session.re_usr_email;
    let user = await userServices.checkUser(email);
    if (user) {
        if (user.otp === user_otp) {
            let userUpdated = await userServices.updateEmailStatus(user._id);
            if (userUpdated) {
                req.session.is_user_logged_in = true;
                res.redirect('/dashboard');
            }
            else {
                req.flash('err_msg', 'Please enter correct secret code.');
                res.redirect('/Verify_account');
            }
        }
    }
    else {
        req.flash('err_msg', 'Something went wrong.');
        res.redirect('/Verify_account');
    }
}

const dashboard = async (req, res) => {
    let err_msg = req.flash('err_msg');
    let success_msg = req.flash('success_msg');
    let wallet_details = "";
    let import_wallet_id = "";
    let rown_bal = "";
    let test = req.session.is_user_logged_in;
    if (test != true) {
        res.redirect('/Login');
    }
    else {
        let user_id = req.session.re_us_id;
        let user = await userServices.checkUserId(user_id);
        let ref_code = user.ref_code;
        let rates = await userServices.getRates();
        // let usdValue = rates.usdValue;
        // let etherValue = rates.etherValue;
        // let btcValue = rates.btcValue;
        // let bnbValue = rates.bnbValue;
        let loginwallet = await blockchainServices.importWalletFindId(user_id);
        if (loginwallet) {
            let result = await blockchainServices.userWalletFindId(loginwallet.wallet_id);
            if (result) {
                req.session.wallet = true;
                let wallet_creation = result.created_at;
                let today = await userServices.createAtTimer();
                let wallet_time_difference = calculateHours(new Date(wallet_creation), new Date(today));
                wallet_details = result;
                import_wallet_id = loginwallet._id;
                let all_transaction = await blockchainServices.findTransactions(wallet_details.wallet_address);
                await blockchainServices.checkTxStatus(all_transaction);
                all_transaction = await blockchainServices.findTransactions(wallet_details.wallet_address);
                let balance = await blockchainServices.getCoinBalance(wallet_details.wallet_address);
                let rown_bal = balance;
                let bnbBalance = await balanceMainBNB(wallet_details.wallet_address);
                let ethBalance = await balanceMainETH(wallet_details.wallet_address);
                let coinbalance = await coinBalanceBNB(wallet_details.wallet_address);
                let usd_value = Math.round(usdValue * coinbalance * 100) / 100;
                let usd_actual = (1 / parseFloat(usdValue)) * coinbalance;
                let bnb_value = (1 / parseFloat(bnbValue)) * bnbBalance;
                let eth_value = (1 / parseFloat(etherValue)) * ethBalance;
                let full_value = usd_actual + bnb_value + eth_value;
                full_value = Math.round(full_value * 100) / 100;
                res.render('front/dashboard', { err_msg, success_msg, ref_code, wallet_details, usdValue, etherValue, btcValue, bnbValue, import_wallet_id, balance, rown_bal, layout: false, session: req.session, crypto, all_transaction, wallet_time_difference, moment, bnbBalance, coinbalance, usd_value, ethBalance, full_value });
            }
        }
        else {
            // let usd_value = 0;
            // let bnbBalance = 0;
            // let ethBalance = 0;
            // let coinbalance = 0;
            // res.render('front/dashboard', { err_msg, success_msg, ref_code, wallet_details, usdValue, etherValue, btcValue, bnbValue, import_wallet_id, rown_bal, layout: false, session: req.session, crypto, all_transaction: [], coinbalance, bnbBalance, usd_value, ethBalance });
            req.session.wallet = false;
            res.redirect('/Create-wallet-dash');
        }
    }
}

const walletSuccess = async (req, res) => {
    let err_msg = req.flash('err_msg');
    let success_msg = req.flash('success_msg');
    let wallet_address = "";
    let test = req.session.is_user_logged_in;
    if (test != true) {
        res.redirect('/Login');
    }
    else {
        if (req.query.wallet) {
            wallet_address = Buffer.from(req.query.wallet, 'base64').toString('ascii');
        }
        res.render('front/wallet-success', { err_msg, success_msg, wallet_address, layout: false, session: req.session, });
    }
}

const referral = async (req, res) => {
    let err_msg = req.flash('err_msg');
    let success_msg = req.flash('success_msg');
    var test = req.session.is_user_logged_in;
    if (test == true) {
        let user_id = req.session.re_us_id;
        let user = await userServices.checkUserId(user_id);
        let ref_code = user.ref_code;
        let referrals = await userServices.findReferData(ref_code);
        res.render('front/referral-table', { err_msg, success_msg, layout: false, session: req.session, ref_code, referrals })
    } else {
        res.redirect('/login');

    }
}

const gettx = async (req, res) => {
    let sender = req.body.sender;
    let txs = await blockchainServices.findTransactions(sender);
    res.send({ txs });
}

const gettxdate = async (req, res) => {
    let sender = req.body.sender;
    let txs = await blockchainServices.findTransactionsDate(sender, req.body.date);
    res.send({ txs });
}

const getrefdate = async (req, res) => {
    let code = req.body.code;
    let txs = await userServices.findReferDataDate(code, req.body.date);
    res.send({ txs });
}

const getrefemail = async (req, res) => {
    let code = req.body.code;
    let txs = await userServices.findReferDataEmail(code);
    res.send({ txs });
}

module.exports = {
    sessionHeader,
    logout,
    landingPage,
    signupPage,
    loginPage,
    forgotPage,
    verifyPage,
    submitForgot,
    submitUser,
    userLogin,
    verifyUser,
    dashboard,
    walletSuccess,
    referral,
    gettx,
    gettxdate,
    getrefdate,
    getrefemail
};
