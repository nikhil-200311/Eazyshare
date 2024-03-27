const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const File = require('../models/file');
const { v4: uuidv4 } = require('uuid');

let storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});

let upload = multer({ storage, limits: { fileSize: 1000000 * 100 }, }).single('myfile');



router.post('/', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            // Step 1: Handle upload error
            return res.status(500).send({ error: err.message });
        }
        if (!req.file) {
            // Step 2: Handle missing file error
            return res.status(400).send({ error: 'No file uploaded' });
        }
        try {
            // Step 3: Store file in database
            const file = new File({
                filename: req.file.filename,
                uuid: uuidv4(),
                path: req.file.path,
                size: req.file.size
            });
            const response = await file.save();
            // Step 4: Send response with file URL
            res.json({ file: `${process.env.APP_BASE_URL}/files/${response.uuid}` });
        } catch (error) {
            // Step 5: Handle d atabase insertion error
            console.error('Error storing file in database:', error);
            res.status(500).send({ error: 'Error storing file in database' });
        }
    });

});

router.get('/send', async (req, res) => {
    const { uuid, emailTo, emailFrom, expiresIn } = req.body;
    if (!uuid || !emailTo || !emailFrom) {
        return res.status(422).send({ error: 'All fields are required except expiry.' });
    }
    // Get data from db
    try {
        const file = await File.findOne({ uuid: uuid });
        if (file.sender) {
            return res.status(422).send({ error: 'Email already sent once.' });
        }
        file.sender = emailFrom;
        file.receiver = emailTo;
        const response = await file.save();
        // send mail
        const sendMail = require('../services/mailService');
        sendMail({
            from: emailFrom,
            to: emailTo,
            subject: 'Eazy file sharing',
            text: `${emailFrom} shared a file with you.`,
            html: require('../services/emailTemplate')({
                emailFrom,
                downloadLink: `${process.env.APP_BASE_URL}/files/${file.uuid}?source=email`,
                size: parseInt(file.size / 1000) + ' KB',
                expires: '24 hours'
            })
        }).then(() => {
            return res.json({ success: true });
        }).catch(err => {
            return res.status(500).json({ error: 'Error in email sending.' });
        });
    } catch (err) {
        return res.status(500).send({ error: 'Something went wrong.' });
    }
});



module.exports = router;
