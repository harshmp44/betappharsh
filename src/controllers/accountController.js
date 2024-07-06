import connection from "../config/connectDB";
import jwt from "jsonwebtoken";
import md5 from "md5";
import request from "request";
import e from "express";
require("dotenv").config();

let timeNow = Date.now();

const randomString = (length) => {
  var result = "";
  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};



// For Firebase config 

const userExists = async (req, res) => {
  let username = req.body.username;
  if (username.length < 9 || username.length > 10 || !isNumber(username)) {
    return res.status(200).json({
      message: "phone error",
      status: false,
    });
  }

  const [rows] = await connection.query(
    "SELECT * FROM users WHERE phone = ? AND veri = 1",
    [username]
  );
  if (rows.length == 0) {
    return res.status(200).json({
      message: "Account does not exist",
      status: false,
      timeStamp: timeNow,
    });
  } else {
    return res.status(200).json({
      message: "User exists",
      status: true,
      timeStamp: timeNow,
    })
  }

}



const randomNumber = (min, max) => {
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
};

const isNumber = (params) => {
  let pattern = /^[0-9]*\d$/;
  return pattern.test(params);
};

const ipAddress = (req) => {
  let ip = "";
  if (req.headers["x-forwarded-for"]) {
    ip = req.headers["x-forwarded-for"].split(",")[0];
  } else if (req.connection && req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  } else {
    ip = req.ip;
  }
  return ip;
};

const timeCreate = () => {
  const d = new Date();
  const time = d.getTime();
  return time;
};

const loginPage = async (req, res) => {
  return res.render("account/login.ejs");
};

const registerPage = async (req, res) => {
  return res.render("account/register.ejs");
};

const forgotPage = async (req, res) => {
  return res.render("account/forgot.ejs");
};

const login = async (req, res) => {
  let { username, pwd } = req.body;

  if (!username || !pwd || !username) {
    //!isNumber(username)
    return res.status(200).json({
      message: "ERROR!!!",
    });
  }

  try {
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE phone = ? AND password = ? ",
      [username, md5(pwd)]
    );
    if (rows.length == 1) {
      if (rows[0].status == 1) {
        const {
          password,
          money,
          ip,
          veri,
          ip_address,
          status,
          time,
          ...others
        } = rows[0];
        const accessToken = jwt.sign(
          {
            user: { ...others },
            timeNow: timeNow,
          },
          process.env.JWT_ACCESS_TOKEN,
          { expiresIn: "1d" }
        );
        await connection.execute(
          "UPDATE `users` SET `token` = ? WHERE `phone` = ? ",
          [md5(accessToken), username]
        );
        return res.status(200).json({
          message: "Login Successfully!",
          status: true,
          token: accessToken,
          value: md5(accessToken),
        });
      } else {
        return res.status(200).json({
          message: "Account has been locked",
          status: false,
        });
      }
    } else {
      return res.status(200).json({
        message: "Incorrect Username or Password",
        status: false,
      });
    }
  } catch (error) {
    if (error) console.log(error);
  }
};

const register = async (req, res) => {
  try {
    let now = new Date().getTime();
    let { username, pwd, invitecode } = req.body;

    let id_user = randomNumber(10000, 99999);
    let otp2 = randomNumber(100000, 999999);
    let name_user = "Member" + randomNumber(10000, 99999);
    let code = randomString(5) + randomNumber(10000, 99999);
    let ip = ipAddress(req);
    let time = timeCreate();

    const [referralUserRes] = await connection.query(
      `SELECT * FROM users WHERE code = '${invitecode}';`
    );

    let referralUser = referralUserRes?.[0];

    if (!referralUser) {
      return res.status(200).json({
        message: "Invalid Invite Code!",
        status: false,
      });
    }

    /**
     * Invite and invitation logic
     */
    const processLevelAndInvitesForUser = async ({ _newUserId }) => {
      if (!invitecode) return;

      let newInviteRecords = [];

      let newUserId = _newUserId;

      newInviteRecords.push([referralUser.id, newUserId, 1, 1]);

      const allLevelsQuery = `SELECT * FROM level;`;

      const [levelsRes] = await connection.query(allLevelsQuery);

      let levels = levelsRes;
      let totalLevels = levels.length;
      let inviteLevel = 1;

      const checkReferralUserInvite = async ({ referralUserId }) => {
        const getReferralUserQuery = `SELECT * FROM invites WHERE new_user_id = '${referralUserId}';`;

        const [referralUserInviteRes] = await connection.query(
          getReferralUserQuery
        );

        const referralInvites = referralUserInviteRes;

        for (
          let referralInvite = 0;
          referralInvite < referralInvites.length;
          referralInvite++
        ) {
          const referralInviteRecord = referralInvites[referralInvite];

          if (!referralInviteRecord) {
            continue;
          }

          let lastLevel = Number(referralInviteRecord.level);

          console.log("lastLevel", lastLevel);
          console.log("totalLevels", totalLevels);

          if (Number(lastLevel) == Number(totalLevels)) {
            continue;
          }

          lastLevel = lastLevel + 1;

          newInviteRecords.push([
            referralInviteRecord?.user_id,
            newUserId,
            lastLevel,
            lastLevel,
          ]);

          inviteLevel = inviteLevel + 1;

          await checkReferralUserInvite({
            referralUserId: referralInvite?.user_id,
          });
        }
      };

      await checkReferralUserInvite({
        referralUserId: referralUser.id,
      });

      // let createNewInviteQuery = `INSERT INTO invites SET user_id = ?, new_user_id = ?, level_id = ?, level = ?  `;
      let createNewInviteQuery = `INSERT INTO invites (user_id, new_user_id, level_id, level) VALUES ?`;

      const [otherLevelsRes] = await connection.query(createNewInviteQuery, [
        newInviteRecords,
      ]);
    };

    if (!username || !pwd || !invitecode) {
      return res.status(200).json({
        message: "ERROR!!!",
        status: false,
      });
    }

    if (username.length < 9 || username.length > 10 || !isNumber(username)) {
      return res.status(200).json({
        message: "phone error",
        status: false,
      });
    }

    try {
      const [check_u] = await connection.query(
        "SELECT * FROM users WHERE phone = ?",
        [username]
      );
      const [check_i] = await connection.query(
        "SELECT * FROM users WHERE code = ? ",
        [invitecode]
      );
      const [check_ip] = await connection.query(
        "SELECT * FROM users WHERE ip_address = ? ",
        [ip]
      );

      if (check_u.length == 1 && check_u[0].veri == 1) {
        return res.status(200).json({
          message: "Registered phone number",
          status: false,
        });
      } else {
        if (check_i.length == 1) {
          // if (check_ip.length <= 3) {
          let ctv = "";
          if (check_i[0].level == 2) {
            ctv = check_i[0].phone;
          } else {
            ctv = check_i[0].ctv;
          }

          const sql =
            "INSERT INTO users SET id_user = ?,phone = ?,name_user = ?,password = ?, plain_password = ?, money = ?,code = ?,invite = ?,ctv = ?,veri = ?,otp = ?,ip_address = ?,status = ?,time = ?";
          const [newUserRes] = await connection.execute(sql, [
            id_user,
            username,
            name_user,
            md5(pwd),
            pwd,
            50,
            code,
            invitecode,
            ctv,
            1,
            otp2,
            ip,
            1,
            time,
          ]);

          console.log("newUserRes", newUserRes);

          const newUserId = newUserRes?.insertId;

          await connection.execute("INSERT INTO point_list SET phone = ?", [
            username,
          ]);

          //   await connection.query(
          //     "UPDATE users SET money = money + ?, total_money = total_money + ? WHERE phone = ? ",
          //     [
          //       info[0].money + (info[0].money / 100) * 5,
          //       info[0].money + (info[0].money / 100) * 5,
          //       info[0].phone,
          //     ]
          //   );

          let [check_code] = await connection.query(
            "SELECT * FROM users WHERE invite = ? ",
            [invitecode]
          );

          if (referralUser) {
            await connection.execute(
              "UPDATE users SET money = ? WHERE id_user = ?",
              [referralUser?.money + 10, referralUser?.id_user]
            );
          }

          if (check_i.name_user !== "Admin") {
            let levels = [
              2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44,
            ];

            for (let i = 0; i < levels.length; i++) {
              if (check_code.length >= levels[i]) {
                await connection.execute(
                  "UPDATE users SET user_level = ? WHERE code = ?",
                  [i + 1, invitecode]
                );
              } else {
                break;
              }
            }

            await processLevelAndInvitesForUser({
              _newUserId: newUserId,
            });
          }

          return res.status(200).json({
            message: "Registered successfully",
            status: true,
          });
          // } else {
          //   return res.status(200).json({
          //     message: "Registered IP address",
          //     status: false,
          //   });
          // }
        } else {
          return res.status(200).json({
            message: "Referrer code does not exist",
            status: false,
          });
        }
      }
    } catch (error) {
      if (error) console.log(error);
    }
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err,
    });
  }
};

const verifyCode = async (req, res) => {
  let phone = req.body.phone;
  let now = new Date().getTime();
  let timeEnd = +new Date() + 1000 * (60 * 2 + 0) + 500;
  let otp = randomNumber(100000, 999999);

  if (phone.length < 9 || phone.length > 10 || !isNumber(phone)) {
    return res.status(200).json({
      message: "phone error",
      status: false,
    });
  }

  const [rows] = await connection.query(
    "SELECT * FROM users WHERE `phone` = ?",
    [phone]
  );
  if (rows.length == 0) {
    await request(
      `http://47.243.168.18:9090/sms/batch/v2?appkey=NFJKdK&appsecret=brwkTw&phone=84${phone}&msg=Your verification code is ${otp}&extend=${now}`,
      async (error, response, body) => {
        let data = JSON.parse(body);
        if (data.code == "00000") {
          await connection.execute(
            "INSERT INTO users SET phone = ?, otp = ?, veri = 0, time_otp = ? ",
            [phone, otp, timeEnd]
          );
          return res.status(200).json({
            message: "Submitted successfully",
            status: true,
            timeStamp: timeNow,
            timeEnd: timeEnd,
          });
        }
      }
    );
  } else {
    let user = rows[0];
    if (user.time_otp - now <= 0) {
      request(
        `http://47.243.168.18:9090/sms/batch/v2?appkey=NFJKdK&appsecret=brwkTw&phone=84${phone}&msg=Your verification code is ${otp}&extend=${now}`,
        async (error, response, body) => {
          let data = JSON.parse(body);
          if (data.code == "00000") {
            await connection.execute(
              "UPDATE users SET otp = ?, time_otp = ? WHERE phone = ? ",
              [otp, timeEnd, phone]
            );
            return res.status(200).json({
              message: "Submitted successfully",
              status: true,
              timeStamp: timeNow,
              timeEnd: timeEnd,
            });
          }
        }
      );
    } else {
      return res.status(200).json({
        message: "Send SMS regularly",
        status: false,
        timeStamp: timeNow,
      });
    }
  }
};

const verifyCodePass = async (req, res) => {
  let phone = req.body.phone;
  let now = new Date().getTime();
  let timeEnd = +new Date() + 1000 * (60 * 2 + 0) + 500;
  let otp = randomNumber(100000, 999999);

  if (phone.length < 9 || phone.length > 10 || !isNumber(phone)) {
    return res.status(200).json({
      message: "phone error",
      status: false,
    });
  }

  const [rows] = await connection.query(
    "SELECT * FROM users WHERE `phone` = ? AND veri = 1",
    [phone]
  );
  if (rows.length == 0) {
    return res.status(200).json({
      message: "Account does not exist",
      status: false,
      timeStamp: timeNow,
    });
  } else {
    let user = rows[0];
    if (user.time_otp - now <= 0) {
      request(
        `http://47.243.168.18:9090/sms/batch/v2?appkey=NFJKdK&appsecret=brwkTw&phone=84${phone}&msg=Your verification code is ${otp}&extend=${now}`,
        async (error, response, body) => {
          let data = JSON.parse(body);
          if (data.code == "00000") {
            await connection.execute(
              "UPDATE users SET otp = ?, time_otp = ? WHERE phone = ? ",
              [otp, timeEnd, phone]
            );
            return res.status(200).json({
              message: "Submitted successfully",
              status: true,
              timeStamp: timeNow,
              timeEnd: timeEnd,
            });
          }
        }
      );
    } else {
      return res.status(200).json({
        message: "Send SMS regularly",
        status: false,
        timeStamp: timeNow,
      });
    }
  }
};



// Firebase forgor password 

const forGotPassword = async (req, res) => {
  let username = req.body.username;
  let otp = req.body.otp;
  let pwd = req.body.pwd;
  let now = new Date().getTime();
  let timeEnd = +new Date() + 1000 * (60 * 2 + 0) + 500;
  let otp2 = randomNumber(100000, 999999);

  if (username.length < 9 || username.length > 10 || !isNumber(username)) {
    return res.status(200).json({
      message: "phone error",
      status: false,
    });
  }

  const [rows] = await connection.query(
    "SELECT * FROM users WHERE phone = ? AND veri = 1",
    [username]
  );
  if (rows.length == 0) {
    return res.status(200).json({
      message: "Account does not exist",
      status: false,
      timeStamp: timeNow,
    });
  } else {
    let user = rows[0];

    await connection.execute(
            "UPDATE users SET password = ?, time_otp = ? WHERE phone = ? ",
            [md5(pwd) , timeEnd, username]
          );
          return res.status(200).json({
            message: "Change password successfully",
            status: true,
            timeStamp: timeNow,
            timeEnd: timeEnd,
          });

    
  }
};

const keFuMenu = async (req, res) => {
  let auth = req.cookies.auth;

  const [users] = await connection.query(
    "SELECT `level`, `ctv` FROM users WHERE token = ?",
    [auth]
  );

  let telegram = "";
  if (users.length == 0) {
    let [settings] = await connection.query(
      "SELECT `telegram`, `cskh` FROM admin"
    );
    telegram = settings[0].telegram;
  } else {
    if (users[0].level != 0) {
      var [settings] = await connection.query("SELECT * FROM admin");
    } else {
      var [check] = await connection.query(
        "SELECT `telegram` FROM point_list WHERE phone = ?",
        [users[0].ctv]
      );
      if (check.length == 0) {
        var [settings] = await connection.query("SELECT * FROM admin");
      } else {
        var [settings] = await connection.query(
          "SELECT `telegram` FROM point_list WHERE phone = ?",
          [users[0].ctv]
        );
      }
    }
    telegram = settings[0].telegram;
  }

  return res.render("keFuMenu.ejs", { telegram });
};

module.exports = {
  login,
  register,
  loginPage,
  registerPage,
  forgotPage,
  verifyCode,
  verifyCodePass,
  forGotPassword,
  keFuMenu,
  userExists,
};
