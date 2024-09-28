import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios'; 
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware setup
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB connected successfully!');
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});

// Define Registration Schema
const RegSchema = new mongoose.Schema({
  name: String,
  email: String,
  location: String,
  church: String,
  phone: String,
  check: { type: Boolean, default: false }
});

const User = mongoose.model('Register', RegSchema);

// Registration endpoint
app.post('/api/register', async (req, res) => {
  const newUser = new User(req.body);
  try {
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(400).json({ message: 'Error registering user', error });
  }
});

// Endpoint to fetch all registered users
app.get('/api/register', async (req, res) => {
  try {
    const users = await User.find(); // Fetch all users
    res.status(200).json(users); // Send users as response
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error });
  }
});

// Update user check property using PATCH method
app.patch('/api/register/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { check: true },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User checked in successfully', user: updatedUser });
  } catch (error) {
    res.status(400).json({ message: 'Error updating user', error });
  }
});

// Blog Schema
const blogSchema = new mongoose.Schema({
  title: String,
  content: String,
  image: String,
}, { timestamps: true });

const Blog = mongoose.model('Blog', blogSchema);

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Create a new blog post
app.post('/api/blogs', upload.single('image'), async (req, res) => {
  const { title, content } = req.body;
  const image = req.file ? req.file.path : '';

  const newBlog = new Blog({ title, content, image });
  try {
    await newBlog.save();
    res.status(201).json(newBlog);
  } catch (error) {
    res.status(400).json({ message: 'Error creating blog post', error });
  }
});

// Get all blog posts
app.get('/api/blogs', async (req, res) => {
  try {
    const blogs = await Blog.find();
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching blogs', error });
  }
});


// Get a single blog post by ID
app.get('/api/blogs/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (blog) {
      res.json(blog);
    } else {
      res.status(404).json({ error: 'Blog not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching blog', error });
  }
});

// Delete a blog post
app.delete('/api/blogs/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (blog) {
      // Delete the image from the server if it exists
      if (blog.image && fs.existsSync(blog.image)) {
        fs.unlinkSync(blog.image);
      }
      await Blog.findByIdAndDelete(req.params.id);
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'Blog not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting blog', error });
  }
});

// Update a blog post
app.put('/api/blogs/:id', upload.single('image'), async (req, res) => {
  const { title, content } = req.body;
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    // If a new image is uploaded, replace the old one
    if (req.file) {
      if (blog.image && fs.existsSync(blog.image)) {
        fs.unlinkSync(blog.image); // Remove old image
      }
      blog.image = req.file.path; // Set new image
    }

    // Update title and content
    blog.title = title || blog.title;
    blog.content = content || blog.content;

    await blog.save();
    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: 'Error updating blog', error });
  }
});

// Subscription endpoint (Mailchimp)
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const mailchimpData = {
    members: [
      {
        email_address: email,
        status: 'subscribed',
      }
    ],
    update_existing: true
  };

  const mailchimpUrl = `https://us21.api.mailchimp.com/3.0/lists/${process.env.MAILCHIMP_AUDIENCE_ID}`;

  try {
    const response = await axios.post(mailchimpUrl, mailchimpData, {
      headers: {
        'Authorization': `apikey ${process.env.MAILCHIMP_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status >= 200 && response.status < 300) {
      res.status(200).json({ message: 'Subscription successful' });
    } else {
      res.status(response.status).json({ message: 'Error subscribing to Mailchimp', data: response.data });
    }
  } catch (error) {
    console.error('Error subscribing to Mailchimp:', error);
    res.status(500).json({ message: 'Error subscribing to Mailchimp', error });
  }
});


// Event Schema
const eventSchema = new mongoose.Schema({
  title: String,
  date: Date,
  time: String,
  image: String,
});

const Event = mongoose.model('Event', eventSchema);

// Create a new event
app.post('/api/events', upload.single('image'), async (req, res) => {
  const { title, date, time } = req.body;
  const image = req.file ? req.file.path : '';

  const newEvent = new Event({ title, date, time, image });
  try {
    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (error) {
    res.status(400).json({ message: 'Error creating event', error });
  }
});

// Get all events (filtering out past dates)
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find({ date: { $gte: new Date() } }).sort({ date: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching events', error });
  }
});

// Delete an event
app.delete('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (event) {
      // Delete the image from the server if it exists
      if (event.image && fs.existsSync(event.image)) {
        fs.unlinkSync(event.image);
      }
      await Event.findByIdAndDelete(req.params.id);
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'Event not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting event', error });
  }
});


// Get the current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the Vite build directory
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Catch-all route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
