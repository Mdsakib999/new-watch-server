const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;

const stripe = require("stripe")(process.env.SECRET_KEY_STRIPE);


const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 5001;
const uri = process.env.MONGO_URI;

cloudinary.config({
  cloud_name: process.env.CLOUDE_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(express.json()); // Middleware to parse JSON
app.use(cors());

const deleteImageUrls = async (urls) => {
  // Ensure `urls` is always an array, even if a single URL is passed
  const urlArray = Array.isArray(urls) ? urls : [urls];

  // Extract public IDs from the URLs
  const publicIds = urlArray.map((url) => url.split("/")[7].split(".")[0]);

  try {
    // Use Cloudinary API to delete resources
    const result = await cloudinary.api.delete_resources(publicIds, {
      type: "upload",
      resource_type: "image",
    });

    return { result };
  } catch (error) {
    console.error("Error deleting images:", error);
    return { error };
  }
};

const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ error: true, message: "unauthorized" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: "unauthorized" });
    }
    req.decoded = decoded;
    next();
  });
};

let db, userCollection, productCollection, brandsCollection; // Store DB collections

async function connectDB() {
  try {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await client.connect(); // Ensure MongoDB connection
    db = client.db("smWatchDB");

    // Initialize Collections
    userCollection = db.collection("users");
    productCollection = db.collection("products");
    brandsCollection = db.collection("brands");
    couponCollection = db.collection("coupons");

    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Exit if MongoDB connection fails
  }
}

// Initialize DB Connection
connectDB();

// Routes
app.get("/", (req, res) => {
  res.send("SM Watch running");
});

// sign jwt
app.post("/jwt", async (req, res) => {
  const { email } = req.body;
  // const isUserExist = await userCollection.findOne({ email });
  // if (!isUserExist) {
  //   return res.send({ message: "User is not exist existed" });
  // }
  // const data = { email: isUserExist.email, role: isUserExist.role };
  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "2d",
  });
  res.send(token);
});
app.get("/me", verifyJWT, async (req, res) => {
  const { email } = req.decoded;
  const isUserExist = await userCollection.findOne({ email });
  if (!isUserExist) {
    return res.send({ message: "User is not exist existed" });
  }
  res.send(isUserExist);
});

// Users API (already exists)
app.post("/users", async (req, res) => {
  const user = req.body;
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query);
  if (existingUser) {
    return res.send({ message: "User already existed" });
  }
  const result = await userCollection.insertOne(user);
  res.send(result);
});

app.get("/users", verifyJWT, async (req, res) => {
  const result = await userCollection.find().toArray();
  res.send(result);
});

app.patch("/userRole/:id", async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const result = await userCollection.updateOne(
    {
      _id: new ObjectId(String(id)),
    },
    {
      $set: { ...data },
    }
  );
  res.send(result);
});

app.delete("/users/:email", async (req, res) => {
  const { email } = req.params;
  const result = await userCollection.deleteOne({ email });
  if (result.deletedCount === 1) {
    res.send({ deletedCount: 1 });
  } else {
    res.status(404).send({ message: "User not found" });
  }
});

// Save Brand API
app.post("/brands", async (req, res) => {
  const { name, imageURL } = req.body;

  // Check if the brand already exists
  const existingBrand = await brandsCollection.findOne({ name });
  if (existingBrand) {
    return res.status(400).send({ message: "Brand already exists" });
  }

  try {
    // Insert the new brand into the database
    const result = await brandsCollection.insertOne({ name, imageURL });
    if (result.insertedId) {
      res.status(200).send({ insertedId: result.insertedId });
    } else {
      res.status(500).send({ message: "Failed to add brand" });
    }
  } catch (error) {
    console.error("Error inserting brand:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// Get All Brands API
app.get("/brands", async (req, res) => {
  try {
    const brands = await brandsCollection.find().toArray();
    res.status(200).send(brands);
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// Edit Brand API (PUT request)
app.put("/brands/:id", async (req, res) => {
  const { id } = req.params; // Extract brand ID from request parameters
  const { name, imageURL } = req.body; // Extract updated name and image URL from request body

  try {
    // Perform the update operation in the database
    const result = await brandsCollection.updateOne(
      { _id: new ObjectId(id) }, // Find the brand by ID
      { $set: { name, imageURL } } // Update the brand's name and image URL
    );

    // Check if the update was successful
    if (result.modifiedCount === 1) {
      res.status(200).send({ message: "Brand updated successfully" });
    } else {
      res.status(404).send({ message: "Brand not found" });
    }
  } catch (error) {
    res.status(500).send({ message: "Server Error", error });
  }
});

// Delete Brand API (DELETE request)
app.delete("/brands/:id", async (req, res) => {
  const { id } = req.params; // Extract brand ID from request parameters

  try {
    // Perform the delete operation in the database
    const result = await brandsCollection.deleteOne({ _id: new ObjectId(id) });

    // Check if the brand was deleted successfully
    if (result.deletedCount === 1) {
      res.status(200).send({ message: "Brand deleted successfully" });
    } else {
      res.status(404).send({ message: "Brand not found" });
    }
  } catch (error) {
    res.status(500).send({ message: "Server Error", error });
  }
});

// Add product
app.post("/product", async (req, res) => {
  const data = req.body;
  try {
    const result = await productCollection.insertOne(data);
    res.send(result);
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).send({ message: "Server error" });
  }
});
app.get("/product", async (req, res) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "date", // Default sorting by date
    sortOrder = "desc", // Default sorting order descending
    search = "",
    minPrice,
    maxPrice,
    category,
  } = req.query;

  const query = {};

  // Search functionality
  if (search) {
    const regex = new RegExp(search, "i"); // Case-insensitive regex
    query.$or = [{ name: regex }, { description: regex }, { brand: regex }];
  }

  // Price range filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  // Category filter
  if (category) {
    query.category = { $regex: category, $options: "i" };
  }

  // Pagination
  const options = {
    limit: parseInt(limit),
    skip: (parseInt(page) - 1) * parseInt(limit),
  };

  // Sorting
  options.sort = {};
  if (sortBy === "price") {
    options.sort.price = sortOrder === "asc" ? 1 : -1;
  } else if (sortBy === "date") {
    options.sort.createdAt = sortOrder === "asc" ? 1 : -1;
  }

  const result = await productCollection.find(query, options).toArray();

  const totalResults = await productCollection.countDocuments(query);
  const totalPages = Math.ceil(totalResults / limit);

  res.send({
    data: result,
    pagination: {
      totalResults,
      totalPages,
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
    },
  });
});
app.get("/product/:id", async (req, res) => {
  const { id } = req.params;
  const result = await productCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});
app.patch("/product/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  if (data.oldImages) {
    await deleteImageUrls(data?.oldImages);
    delete data?.oldImages;
  }
  if (data._id) {
    delete data?._id;
  }
  const result = await productCollection.updateOne(
    { _id: new ObjectId(id) }, // Ensure the ID is converted
    { $set: { ...data } } // Update the fields
  );
  res.send(result);
});
app.delete("/product/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const isProductExist = await productCollection.findOne({
    _id: new ObjectId(id),
  });
  if (!isProductExist) {
    return res.send({ message: "Product is not exist existed" });
  }
  await deleteImageUrls(isProductExist.images);
  const result = await productCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

//  manage Coupon
app.post("/coupon", verifyJWT, async (req, res) => {
  const data = req.body;
  const expireDate = data.expireDate;
  const currentDate = new Date();
  if (new Date(expireDate) < currentDate) {
    return res.status(403).send({
      error: true,
      message: "Expiration date must be greater than the current date.",
    });
  }
  const result = await couponCollection.insertOne(data);
  res.send(result);
});
app.get("/coupon", verifyJWT, async (req, res) => {
  const result = await couponCollection.find().toArray();
  res.send(result);
});

app.delete("/coupon/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const result = await couponCollection.findOneAndDelete({
    _id: new ObjectId(String(id)),
  });
  res.send(result);
});

app.post("/validCoupon", async (req, res) => {
  const { couponText } = req.body;
  const isExistCoupon = await couponCollection.findOne({
    couponText,
  });
  if (!isExistCoupon) {
    return res.status(404).send({ message: "Coupon Doest Exist" });
  }
  if (new Date(isExistCoupon.expireDate) < new Date()) {
    return res.status(403).send({ message: "Coupon is Expire" });
  }
  res.send({ discount: isExistCoupon.discountTk });
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { price } = req.body;
    
    if (!price || price <= 0) {
      return res.status(400).json({ error: "Invalid price" });
    }

    const amount = Math.round(price * 100); // Convert to cents

    // Correct Stripe API call
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({ error: error.message });
  }
});



// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
