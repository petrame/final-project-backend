import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcrypt-nodejs";
import dotenv from "dotenv";
import cloudinaryStorage from "multer-storage-cloudinary";
import multer from "multer";
import Local from "./models/localModel";
import localsData from "./data/locals.json";
import cloudinaryFramework from "cloudinary";

dotenv.config();

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost/torslandalocals";
mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.Promise = Promise;

const cloudinary = cloudinaryFramework.v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = cloudinaryStorage({
  cloudinary,
  params: {
    folder: "image_logo",
    transformation: [{ width: 500, height: 500, crop: "limit" }],
  },
});

const parser = multer({ storage });

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, "Name is required"],
    minlength: [2, "Use a minimum of 2 characters"],
  },
  lastName: {
    type: String,
    required: [true, "Name is required"],
    minlength: [2, "Use a minimum of 2 characters"],
  },
  password: {
    type: String,
    required: true,
    minlength: [6, "The password must be at least six characters long."],
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  accessToken: {
    type: String,
    default: () => crypto.randomBytes(128).toString("hex"),
    unique: true,
  },
});

userSchema.pre("save", async function (next) {
  const user = this;

  // If the password is not changed
  if (!user.isModified("password")) {
    return next();
  }

  // Encrypt the password if it is changed
  const salt = bcrypt.genSaltSync();
  user.password = bcrypt.hashSync(user.password, salt);
  next();
});

const User = mongoose.model("User", userSchema);

const authenticateUser = async (req, res, next) => {
  try {
    const accessToken = req.header("Authorization");
    const user = await User.findOne({ accessToken });

    if (!user) {
      throw "User not found.";
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Something went wrong, please try again." });
    console.log(err);
  }
};

const port = process.env.PORT || 8080;
const app = express();

app.use(cors());
app.use(bodyParser.json());

// Clearing and populating database
if (process.env.RESET_DATABASE) {
  const populateDatabase = async () => {
    await Local.deleteMany();
    localsData.forEach((item) => {
      const imagePath = `./logos/${item.category.toLocaleLowerCase()}/${
        item.img
      }`;
      cloudinary.uploader
        .upload(imagePath, {
          folder: `image_logo/${item.category.toLocaleLowerCase()}`,
          use_filename: true,
          unique_filename: false,
          overwrite: true,
        })
        .then((result) => {
          item.img_url = result.url;
          item.img_id = result.public_id;
          const newLocal = new Local(item);
          newLocal.save();
          console.log(`saved ${item.name}`);
        })
        .catch((error) => console.log(error));
    });
  };
  populateDatabase();
}

app.get("/", (req, res) => {
  res.send("API for final project, made by Evelina and Petra");
});

// User endpoints
app.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Endpoint for signing up user
app.post("/users", async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    const newUser = new User({ firstName, lastName, email, password });
    await newUser.save();
    res.status(200).json({
      id: newUser._id,
      accessToken: newUser.accessToken,
      firstName: newUser.lastName,
      lastName: newUser.lastName,
    });
  } catch (err) {
    res.status(400).json({ message: "Could not create user.", errors: err });
  }
});

// Endpoint for logging in user
app.post("/sessions", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  console.log("user: " + user)
  if (user && bcrypt.compareSync(req.body.password, user.password)) {
    res.json({
      id: user._id,
      accessToken: user.accessToken,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    });
  } else {
    res.status(400).json({
      message: "Could not log in, check your user details.",
    });
  }
});

// Endpoint for update user
app.put("/:id/user", authenticateUser);
app.put("/:id/user", async (req, res) => {
  const accessToken = req.header("Authorization");
  const { firstName, lastName, email } = req.body;

  try {
    await User.updateOne( {accessToken }, { firstName, lastName, email });
    res.status(200).json({message: `User details for ${firstName} updated.`});
  } catch (err) {
    res.status(400).json({
      message: "Could not update user.",
      error: err.errors,
    });
  }
});

// Authenticate user
app.get("/:id/user", authenticateUser);
app.get("/:id/user", async (req, res) => {
  const accessToken = req.header("Authorization");
  const user = await User.findOne({ accessToken: accessToken });
  res.json({ message: `Hello ${user.firstName} ${user.lastName}` });
});

// Locals endpoints
// Post new local
app.post("/locals", parser.single("img_url"), async (req, res) => {
  Local.findOne({ name: req.body.name }, (data) => {
    if (data === null) {
      const newLocal = new Local({
        category: req.body.category,
        name: req.body.name,
        tagline: req.body.tagline,
        img_url: req.file.path,
        img_id: req.file.filename,
        street_address: req.body.street,
        zip_code: req.body.zip_code,
        phone_number: req.body.phone_number,
        web_shop: req.body.web_shop,
        booking: req.body.booking,
        url: req.body.url,
      });
      newLocal.save((err, data) => {
        if (err) return res.json({ Error: err });
        return res.json(data);
      });
    } else {
      return res.json({ message: "Local already exist" });
    }
  });
});

app.get("/locals"),
  async (req, res) => {
    console.log("hi");
    try {
      const locals = await Local.find();
      console.log(locals);
      res.json(locals);
    } catch (err) {
      res.status(400).json({ message: "Could not find locals.", errors: err });
    }
  };

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
