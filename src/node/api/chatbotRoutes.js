const router = require('express').Router();
const Chatbot = require('../models/chatbotModel');
const FAQ = require('../models/faqModel');
const Feedback = require('../models/feedbackModel');
const authenticate = require('../signup/middleware/authMiddleware');
const PDF = require('../models/PDFModel');
const mongoose = require('mongoose');

router.get('/count', authenticate, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id); // Ensure it's an ObjectId
        const chatbotCount = await Chatbot.countDocuments({ userId }); // Count all chatbots for this user
        res.json({ count: chatbotCount });
    } catch (error) {
        console.error('Error counting chatbots:', error);
        res.status(500).json({ message: 'Failed to count chatbots', error: error.toString() });
    }
});

router.get('/name/:chatbotId', authenticate, async (req, res) => {
    const { chatbotId } = req.params;

    try {
        // Find the chatbot by its ID, only return the 'name' field
        const chatbot = await Chatbot.findById(chatbotId, 'name');

        if (!chatbot) {
            return res.status(404).json({ message: 'Chatbot not found' });
        }

        // Return the chatbot name as JSON
        res.json({ name: chatbot.name });
    } catch (error) {
        console.error('Failed to fetch chatbot name:', error);
        res.status(500).json({ 
            message: 'Failed to fetch chatbot name', 
            error: error.toString() 
        });
    }
});


router.get('/', authenticate, async (req, res) => {
    try {
        console.log('Fetching chatbots for user:', req.user.id); // Log the user ID to confirm it's being passed
        const chatbots = await Chatbot.find({ userId: req.user.id });
        console.log('Chatbots found:', chatbots); // Log the fetched chatbots
        res.json(chatbots);
    } catch (error) {
        console.error('Failed to fetch chatbots', error);
        res.status(500).json({ message: "Failed to fetch chatbots", error: error.toString() });
    }
});


// Existing POST route for creating/updating chatbots
router.post('/', authenticate, async (req, res) => {
    const { name, type, faqs, pdfId } = req.body;
    const userId = req.user.id;

    // Validate pdfId if provided
    if (pdfId && !Array.isArray(pdfId)) {
        return res.status(400).json({ message: 'pdfId must be an array' });
    }

    try {
        let chatbot = await Chatbot.findOne({ userId, name });
        if (chatbot) {
            // Update existing chatbot if found
            chatbot.faqs = faqs;
            chatbot.type = type;
            chatbot.name = name;
            if (pdfId && Array.isArray(pdfId)) {
                chatbot.pdfId = pdfId; // Update the PDF references if provided
            }
            await chatbot.save();
        } else {
            // Create a new chatbot if not found
            chatbot = new Chatbot({
                name,
                type,
                userId,
                faqs,
                pdfId: pdfId || [], // Ensure pdfId is initialized as an array
            });
            await chatbot.save();
        }

        res.status(201).json({
            message: 'Chatbot saved successfully',
            chatbot,
            pdfs: Array.isArray(chatbot.pdfId) ? chatbot.pdfId : [chatbot.pdfId], // Include the list of PDFs in the response
        });
    } catch (error) {
        console.error('Error in saving chatbot:', error);
        res.status(500).json({ message: 'Failed to create or update chatbot', error: error.toString() });
    }
});

// **New GET route to fetch chatbot details with FAQs and PDFs**
router.get('/:id', authenticate, async (req, res) => {
    const chatbotId = req.params.id;
    const userId = req.user.id;

    // Validate chatbotId
    if (!mongoose.Types.ObjectId.isValid(chatbotId)) {
        return res.status(400).json({ message: 'Invalid chatbotId provided' });
    }

    try {
        // Find the chatbot, populate faqs and pdfId
        const chatbot = await Chatbot.findOne({ _id: chatbotId, userId })
            .populate('faqs')       // Populate FAQs
            .populate('pdfId');     // Populate pdfId (single or array of PDFs)

        if (!chatbot) {
            return res.status(404).json({ message: 'Chatbot not found' });
        }

        // Extract FAQs and PDFs (ensure pdfId is always an array)
        const faqs = chatbot.faqs || [];
        const pdfs = Array.isArray(chatbot.pdfId) ? chatbot.pdfId : [chatbot.pdfId];

        res.status(200).json({ chatbot, faqs, pdfs });
    } catch (error) {
        console.error('Error fetching chatbot details:', error);
        res.status(500).json({ message: 'Error fetching chatbot details', error: error.toString() });
    }
});

// **DELETE route (for completeness)**
router.delete('/:id', authenticate, async (req, res) => {
    const chatbotId = req.params.id;
    const userId = req.user.id;

    // Validate chatbotId
    if (!mongoose.Types.ObjectId.isValid(chatbotId)) {
        return res.status(400).json({ message: 'Invalid chatbotId provided' });
    }

    try {
        const chatbot = await Chatbot.findOne({ _id: chatbotId, userId });
        if (!chatbot) {
            return res.status(404).json({ message: 'Chatbot not found' });
        }

        // If chatbot has a PDF, delete it
        if (chatbot.pdfId) {
            const pdf = await PDF.findById(chatbot.pdfId);
            if (pdf) {
                // Delete the PDF file from the server (if stored on disk)
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '..', 'uploads', pdf.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }

                // Remove the PDF document from the database
                await PDF.deleteOne({ _id: chatbot.pdfId });
            }
        }

        // Delete the chatbot
        await Chatbot.deleteOne({ _id: chatbotId });

        res.status(200).json({ message: 'Chatbot deleted successfully' });
    } catch (error) {
        console.error('Error deleting chatbot:', error);
        res.status(500).json({ message: 'Error deleting chatbot', error: error.toString() });
    }
});

router.get('/:chatbotId', authenticate, async (req, res) => {
    try {
        const chatbot = await Chatbot.findById(req.params.chatbotId);
        if (!chatbot) {
            return res.status(404).json({ message: 'Chatbot not found' });
        }

        // Fetch FAQs associated with this chatbot
        const faqs = await FAQ.find({ _id: { $in: chatbot.faqs } });

        // Fetch PDFs associated with this chatbot
        const pdfs = await PDF.find({ chatbotId: req.params.chatbotId });

        // Send chatbot, FAQs, and PDFs data
        res.json({ chatbot, faqs, pdfs });
    } catch (error) {
        console.error('Failed to fetch chatbot', error);
        res.status(500).json({ message: "Failed to fetch chatbot", error: error.toString() });
    }
});

router.delete('/:chatbotId', authenticate, async (req, res) => {
    const { chatbotId } = req.params;
    console.log("DELETE request received for Chatbot ID:", chatbotId);

    try {
        // Check if the chatbot exists
        const chatbot = await Chatbot.findById(chatbotId);
        if (!chatbot) {
            console.log("Chatbot not found for ID:", chatbotId);
            return res.status(404).json({ message: 'Chatbot not found' });
        }

        // Log the FAQs to be deleted
        console.log("Associated FAQs:", chatbot.faqs);

        // Delete associated FAQs
        await FAQ.deleteMany({ _id: { $in: chatbot.faqs } });
        console.log("FAQs deleted successfully.");

        // Delete the chatbot
        await Chatbot.findByIdAndDelete(chatbotId);
        console.log("Chatbot deleted successfully.");

        res.json({ message: 'Chatbot and associated FAQs deleted successfully' });
    } catch (error) {
        console.error("Error during deletion:", error);
        res.status(500).json({ message: 'Failed to delete chatbot', error: error.toString() });
    }
});

router.get('/ratings/:chatbotId', authenticate, async (req, res) => {
    try {
        const chatbotId = req.params.chatbotId;

        // Fetch ratings based on chatbot ID, assuming you have a Ratings model.
        const ratings = await Feedback.find({ chatbotId });

        if (!ratings || ratings.length === 0) {
            return res.status(404).json({ message: 'No ratings found for this chatbot' });
        }

        res.json(ratings);
    } catch (error) {
        console.error('Error fetching ratings:', error);
        res.status(500).json({ message: 'Failed to fetch ratings', error: error.toString() });
    }
});

router.get('/chatbots', authenticate, async (req, res) => {
    try {
        const chatbots = await Chatbot.find({ userId: req.user.id }, 'name');
        res.json(chatbots);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chatbots', error: error.message });
    }
});

// Get feedbacks for a specific chatbot
router.get('/feedbacks/:chatbotId', authenticate, async (req, res) => {
    const { chatbotId } = req.params;
    const { rating } = req.query; // Capture the rating from query parameters

    try {
        let query = { chatbotId: chatbotId };
        if (rating && rating !== 'all') {
            query.rating = rating; // Add rating to the query if it's specified and not 'all'
        }

        const feedbacks = await Feedback.find(query);
        res.json(feedbacks);
    } catch (error) {
        console.error('Error fetching feedbacks:', error);
        res.status(500).json({ message: 'Server error while fetching feedbacks.', error: error.message });
    }
});

module.exports = router;
