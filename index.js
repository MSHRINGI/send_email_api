const express = require("express");
const port = 8000;
const app = express();
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(api_key);

app.use(bodyParser.json());

function getUniqueListBy(arr, key) {
  return [...new Map(arr.map((item) => [item[key], item])).values()];
}

let middlewareFuction = async function (req, res) {
  try {
    console.log("BODY", req.body);
    const data = req.body;
    const users = data.userData;
    let arrOfToEmails = [];
    let arrOfCCEmails = [];
    let arrOfBCCEmails = [];
    let allAtachments = [];
    let arrayAttachments = [];
    let message = data.emailMessage;

    const variables = new RegExp(/{([^}]+)}/g);

    let extractParams = message.match(variables);

    // For finding the unique emails(removed duplicate email)
    const uniqueUsers = getUniqueListBy(users, "email");
    console.log("UNIQUE USERS", uniqueUsers);

    // For pushing the values in toEmails, ccEmails and bccEmails from unique users
    uniqueUsers.map((user) => {
      if (user.type == "to") {
        arrOfToEmails.push(user);
      } else if (user.type == "cc") {
        arrOfCCEmails.push(user);
      } else if (user.type == "bcc") {
        arrOfBCCEmails.push(user);
      } else {
        res.status(400).json({
          message: "Please mention the type between them = to/cc/bcc",
        });
      }
    });

    // console.log("extractParams", extractParams);

    // checking if attachments are available for sending then just send all attachments into the array
    if (data.attachments) {
      allAtachments = data.attachments;
      if (allAtachments.length > 0) {
        allAtachments.map((file) => {
          const sendingFile = fs
            .readFileSync(__dirname + `${file.path}`)
            .toString("base64");
          const ext = path.extname(__dirname + `${file.path}`);
          let tempObj = {
            content: sendingFile,
            filename: file.filename,
            type: `application/${ext}`,
            disposition: "attachment",
            content_id: "mytext",
          };
          arrayAttachments.push(tempObj);
        });
      }
    }

    // now use map function for arrOfToEmails and just give the array of CC & BCC
    arrOfToEmails.map((user) => {
      for (value of extractParams) {
        let key = value.substring(1, value.length - 1);
        if (!user[key]) {
          return res.status(400).json({
            message: "Please provide all variable details!",
          });
        }
        message = message.replace(value, user[key]);
        // console.log("Temp", temp, "User ", user[temp]);
      }
      //   console.log("TEMPPPP", message);
      let msg = {
        to: user.email,
        from: {
          name: "Manish Shringi",
          email: "mshringi22@gmail.com",
        },
        cc: arrOfCCEmails,
        bcc: arrOfBCCEmails,
        subject: "Testing SendGrid",
        text: message,
        html: message,
        // templateId: "d-eacbb54689b04edd89e7c5ec442279a2",
        // dynamicTemplateData: {
        //   name: user.name,
        //   status: user.status,
        // },
        attachments: arrayAttachments,
      };

      console.log("MSG", msg);
      sgMail
        .send(msg)
        .then((response) => {
          console.log("Email sent", response);
        })
        .catch((error) => {
          console.error(error);
          console.log(error.response.body);
        });
    });
    res.status(200).json({
      status: 200,
      message: "All message sent!!",
    });
  } catch (err) {
    console.log("Error in middleware", err);
    res.status(501).json({
      data: {
        message: "Something is wrong!!",
      },
    });
  }
};

app.post("/api/sendEmails", middlewareFuction);

app.listen(port, function (err) {
  if (err) {
    console.log("Error in connecting server", err);
  }
  console.log("Server is running on port ::", port);
});
