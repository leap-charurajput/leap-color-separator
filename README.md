# LEAP Color Separator

An Adobe Illustrator CEP extension for color separation workflows.

---

## 🔹 User Guide

### 🚀 Installation Steps

#### 1️⃣ Install ZXPInstaller

- Download **ZXPInstaller** from [https://zxpinstaller.com/](https://zxpinstaller.com/)
- Install it on your computer

#### 2️⃣ Install the Extension

- Open **ZXPInstaller**
- Drag and drop the `.zxp` file into the ZXPInstaller window
- The extension will be installed into your CEP extensions folder automatically

#### 3️⃣ Open in Adobe Illustrator

- Launch **Adobe Illustrator**
- Navigate to **`Window` → `Extensions` → `LEAP Color Separator`**
- Click on it to open the extension panel

✅ **You're all set!**

---

## 🔹 Developer Guide

### 🔗 Clone the Repository

```sh
git clone -b development <repo-url>
cd leap-color-separator
```

### 📦 Install Dependencies

```sh
npm install
```

### 🧑‍💻 Run in Development Mode

```sh
npm run dev
```

This runs two processes concurrently:

- `ng serve --port 6002` — Angular dev server with hot reload
- `webpack --watch` — auto-rebuilds `leap-dist.js` on every save to `leap-src-index.js`

> ⚠️ If you make changes to `leap-src-index.js`, webpack will rebuild automatically in dev mode. No manual steps needed.

### 🏗️ Available Scripts

| Script                    | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `npm run dev`             | Start local dev server with webpack watch                |
| `npm run build:leap`      | Compile `leap-src-index.js` → `leap-dist.js` via webpack |
| `npm run build`           | Build Angular app                                        |
| `npm run setup-cep`       | Copy build output into CEP extension folder              |
| `npm run build-and-setup` | Run all three above in sequence (use for deployment)     |
| `npm run zxp`             | Package extension as `.zxp` file                         |

> ⚠️ Always use `npm run build-and-setup` when deploying — not just `npm run build`. Running only `npm run build` will bundle a stale `leap-dist.js` and your `leap-src-index.js` changes won't appear.

---

## 🔹 Deployment

### 🛠️ Development Server

```sh
cd /var/www/html/leap-color-sep-dev/leap_color_separation
git pull origin development
npm run build:leap
npm run build
```

### 🚀 Production Server

```sh
cd /var/www/html/leap-color-sep
git pull origin production
npm run build:leap
npm run build
```
