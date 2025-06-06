const mongoose = require('mongoose');

const connectDB = async () => {
    try {

        const mongoURI = process.env.MONGO_URI || 'mongodb+srv://admin:admin12345@cluster-url/database?retryWrites=true&w=majority'; 
        await mongoose.connect(mongoURI);

        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('Failed to connect to MongoDB', error);
    }
};

module.exports = connectDB;
