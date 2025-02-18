const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 5000;
const uri = process.env.MONGO_URI;

const app = express();
app.use(express.json()); // Middleware to parse JSON
app.use(cors());

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
app.post("/product", async (req, res) => {
  const data = req.body;
  try {
    const result = await productCollection.insertOne(data);
    res.status(200).send(result);
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).send({ message: "Server error" });
  }
});
app.get("/products", async (req, res) => {
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

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
