const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = 3000;

// Define directories
const packsDir = path.join(__dirname, 'packs');
const addonsFile = path.join(__dirname, '..', 'arrays', 'addons.js');
const iconsDir = path.join(__dirname, '..', 'addonIcons');

// Ensure directories exist with proper permissions
async function ensureDirectories() {
  try {
    await fs.mkdir(packsDir, { recursive: true });
    await fs.chmod(packsDir, 0o755);
    await fs.mkdir(iconsDir, { recursive: true });
    await fs.chmod(iconsDir, 0o755);
    console.log('Directories ready:', { packsDir, iconsDir });
  } catch (error) {
    console.error('Error setting up directories:', error);
    throw error;
  }
}
ensureDirectories();

// Configure multer for pack uploads
const packStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, packsDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const packUpload = multer({
  storage: packStorage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(mcaddon|mcpack|mcworld)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .mcaddon, .mcpack, or .mcworld files are allowed.'));
    }
  }
});

// Configure multer for icon uploads
const iconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, iconsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const timestamp = Date.now();
    cb(null, `${baseName}-${timestamp}${ext}`);
  }
});
const iconUpload = multer({
  storage: iconStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files are allowed.'));
    }
  }
});

// Serve static files
app.use(express.static(__dirname));
app.use('/addonIcons', express.static(iconsDir));
app.use(express.json());

// Get list of packs
app.get('/packs', async (req, res) => {
  try {
    const files = await fs.readdir(packsDir);
    const packs = files.filter(file => file.match(/\.(mcaddon|mcpack|mcworld)$/));
    res.json(packs);
  } catch (error) {
    console.error('Error reading packs directory:', error);
    res.status(500).send('Error reading packs directory');
  }
});

// Get addons.js content
app.get('/addons', async (req, res) => {
  try {
    const content = await fs.readFile(addonsFile, 'utf8');
    // Extract the addons array from the file content
    const addonsMatch = content.match(/const addons = (\[.*?\]);/s);
    if (!addonsMatch) {
      throw new Error('Invalid addons.js format');
    }
    const addons = JSON.parse(addonsMatch[1]);
    res.json({ addons });
  } catch (error) {
    console.error('Error reading addons.js:', error);
    res.status(500).send('Error reading addons.js');
  }
});

// Upload icon image
app.post('/upload-icon', iconUpload.single('icon'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('No icon file uploaded');
      return res.status(400).json({ error: 'No icon file uploaded' });
    }
    console.log(`Uploaded icon: ${req.file.originalname} to ${req.file.path}`);
    res.json({ filename: req.file.filename });
  } catch (error) {
    console.error('Error uploading icon:', error.message);
    res.status(500).json({ error: `Upload error: ${error.message}` });
  }
});

// Update addons.js
app.post('/update-addons', async (req, res) => {
  try {
    const { packName, addonData, isEdit } = req.body;
    let content = await fs.readFile(addonsFile, 'utf8');
    let addons = [];
    
    // Extract current addons array
    const addonsMatch = content.match(/const addons = (\[.*?\]);/s);
    if (addonsMatch) {
      addons = JSON.parse(addonsMatch[1]);
    }

    if (isEdit) {
      // Update existing addon
      const index = addons.findIndex(a => 
        a.download === `//${packName}` || 
        a.download === `//[B]${packName}` || 
        a.download === `//[R]${packName}` ||
        (a.types.includes('addon') && (packName === `[B]${a.download.replace('//', '')}` || packName === `[R]${a.download.replace('//', '')}`))
      );
      if (index !== -1) {
        addons[index] = addonData;
      } else {
        throw new Error('Addon not found');
      }
    } else {
      // Add new addon
      addons.push(addonData);
    }

    // Format the new content
    const newContent = `const addons = ${JSON.stringify(addons, null, 2)};\n`;
    await fs.writeFile(addonsFile, newContent);
    res.status(200).send('Addons updated successfully');
  } catch (error) {
    console.error('Error updating addons.js:', error);
    res.status(500).send(`Error updating addons.js: ${error.message}`);
  }
});

// Upload new pack
app.post('/upload', packUpload.single('pack'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).send('No file uploaded');
    }
    console.log(`Uploaded file: ${req.file.originalname} to ${req.file.path}`);
    res.status(200).send('Uploaded successfully');
  } catch (error) {
    console.error('Error uploading pack:', error.message);
    res.status(500).send(`Upload error: ${error.message}`);
  }
});

// Serve pack file
app.get('/packs/:packName', async (req, res) => {
  try {
    const filePath = path.join(packsDir, req.params.packName);
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving pack:', error);
    res.status(500).send('Error serving file');
  }
});

// Update pack
app.post('/update/:packName', packUpload.single('pack'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('No file uploaded for update');
      return res.status(400).send('No file uploaded');
    }
    console.log(`Updated pack: ${req.params.packName}`);
    res.status(200).send('Updated successfully');
  } catch (error) {
    console.error('Error updating pack:', error);
    res.status(500).send(`Update error: ${error.message}`);
  }
});

// Rename pack
app.post('/rename/:packName', async (req, res) => {
  try {
    const oldPath = path.join(packsDir, req.params.packName);
    const newPath = path.join(packsDir, req.body.newName);
    await fs.access(oldPath);
    await fs.rename(oldPath, newPath);
    console.log(`Renamed pack from ${req.params.packName} to ${req.body.newName}`);
    res.status(200).send('Renamed successfully');
  } catch (error) {
    console.error('Error renaming pack:', error);
    res.status(500).send('Rename error');
  }
});

// Delete pack
app.delete('/delete/:packName', async (req, res) => {
  try {
    const filePath = path.join(packsDir, req.params.packName);
    await fs.access(filePath);
    await fs.unlink(filePath);
    console.log(`Deleted pack: ${req.params.packName}`);
    res.status(200).send('Deleted successfully');
  } catch (error) {
    console.error('Error deleting pack:', error);
    res.status(500).send('Delete error');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});