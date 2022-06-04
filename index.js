const express = require("express");
const port = process.env.PORT;
const app = express();
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const sgMail = require("@sendgrid/mail");
const https = require("https");

app.use(bodyParser.json());

let toEmails = [];
let ccEmails = [];
let bccEmails = [];
let attachments = [];
let message_id = [];
let webHooksEvents = [];
const api_key = process.env.SENDGRID_API_KEY;

sgMail.setApiKey(api_key);

// function for removing duplicates form an array
let getUniqueListBy = function (arr, key) {
  return [...new Map(arr.map((item) => [item[key], item])).values()];
};

// this method is used for pushing all the attachments into the array of attachments
let getAttachments = function (requestAtachments) {
  if (requestAtachments.length > 0) {
    requestAtachments.map((file) => {
      const attachedFile = fs
        .readFileSync(__dirname + `${file.path}`)
        .toString("base64");
      const ext = path.extname(__dirname + `${file.path}`);
      let attachmentObj = {
        content: attachedFile,
        filename: file.filename,
        type: `application/${ext}`,
        disposition: "attachment",
        content_id: "mytext",
      };
      attachments.push(attachmentObj);
    });
  }
};

let getMessageBody = function (user, messageVariables, emailMessage, res) {
  // replacing variables in emailMessages to user's actual data
  if (!user.email) {
    throw new Error("Please provide email of user");
  }
  for (value of messageVariables) {
    let key = value.substring(1, value.length - 1);
    if (user[key]) {
      emailMessage = emailMessage.replace(value, user[key]);
    }
  }
  let msg = {
    to: user.email,
    from: {
      name: "Manish Shringi",
      email: "mshringi22@gmail.com",
    },
    cc: ccEmails,
    bcc: bccEmails,
    subject: "Message through SendGrid",
    text: emailMessage,
    html: emailMessage,
    attachments: attachments,
  };
  return msg;
};

// this method used for fetching the data form event webHooks and genrating desired response
let findStatusAndGenerateResponse = function (res) {
  let listOfSuccessEmails = [];
  let listOfFailureEmails = [];
  const url =
    "https://webhook.site/token/562c7050-4963-410e-9f3b-3ae28086db4c/requests?page=1&password=&query=&sorting=newest";
  https
    .get(url, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        data = JSON.parse(data);
        data.data.forEach((event) => {
          if (event.content) {
            let contentData = JSON.parse(event.content);

            message_id.forEach((id) => {
              if (contentData[0].sg_message_id.includes(id)) {
                webHooksEvents.push(contentData[0]);
              }
            });
          }
        });

        webHooksEvents = getUniqueListBy(webHooksEvents, "email");
        webHooksEvents.forEach((event) => {
          if (event?.event == "delivered")
            listOfSuccessEmails.push({
              email: event.email,
              status: event.event,
            });
          else
            listOfFailureEmails.push({
              email: event.email,
              status: event.event,
            });
        });
        return res.status(200).json({
          status: 200,
          message: "Messages has been sent Using SendGrid",
          success: listOfSuccessEmails,
          failure: listOfFailureEmails,
        });
      });
    })
    .on("error", (err) => {
      console.log("Error form URL API", err.message);
      throw new Error("Error form webHooks API");
    });
};

// this method used For pushing the values in toEmails, ccEmails and bccEmails from unique users
let seprateEmailsAccordingTypes = function (uniqueUsers, res) {
  uniqueUsers.map((user) => {
    if (!user.type) {
      throw new Error("Please mention the type of all emails");
    } else if (!user.email) {
      throw new Error("Please provide emails to all users");
    } else {
      if (user.type == "to") {
        toEmails.push(user);
      } else if (user.type == "cc") {
        ccEmails.push(user);
      } else if (user.type == "bcc") {
        bccEmails.push(user);
      } else {
        res.status(400).json({
          message: "Please mention the type of emails => to/cc/bcc",
        });
      }
    }
  });
};

let sendEmails = async function (req, res) {
  try {
    const data = req.body;
    if (!data.userData || !data.emailMessage) {
      throw new Error(
        "Please provide user's data in userData and emailMessage"
      );
    }
    const users = data.userData;
    let emailMessage = data.emailMessage;
    toEmails = [];
    ccEmails = [];
    bccEmails = [];
    attachments = [];
    message_id = [];
    webHooksEvents = [];

    // used for finding variables like('{}') in emailMessages
    const regexp = new RegExp(/{([^}]+)}/g);

    // this is the array of all the variables in emailMessage
    let messageVariables = emailMessage.match(regexp);

    // For finding the unique emails(removed duplicate email)
    const uniqueUsers = getUniqueListBy(users, "email");

    seprateEmailsAccordingTypes(uniqueUsers, res);

    // For fetching the attachment if available
    if (data.attachments) {
      getAttachments(data.attachments);
    }

    // now use map function for toEmails and just give the array of CC & BCC
    if (toEmails.length <= 0) {
      throw new Error("at least one user must have type 'to'");
    }
    toEmails.map((user) => {
      let msg = getMessageBody(user, messageVariables, emailMessage, res);

      sgMail
        .send(msg)
        .then(([response]) => {
          console.log(
            "Email sent with this message_ID",
            response.headers["x-message-id"]
          );
          message_id.push(response.headers["x-message-id"]);
        })
        .catch((error) => {
          console.error("ERROR FROM SEND FUNCTION", error);
          throw new Error(error);
        });
    });

    setTimeout(findStatusAndGenerateResponse, 15000, res);
  } catch (err) {
    console.log("Error in middleware", err);
    err = Object.getOwnPropertyNames(err).reduce((acc, key) => {
      acc[key] = err[key];
      return acc;
    }, {});
    return res.status(501).send({
      error: {
        message: err.message,
      },
    });
  }
};

app.post("/api/sendEmails", sendEmails);

app.listen(port, function (err) {
  if (err) {
    console.log("Error in connecting server", err);
  }
  console.log("Server is running on port ::", port);
});
