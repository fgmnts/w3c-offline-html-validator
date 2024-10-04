import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import AdmZip from "adm-zip"; // Make sure adm-zip is installed: npm install adm-zip

import { URL } from "url";

async function downloadBinary(url, destPath) {
  return new Promise((resolve, reject) => {
    const zipFilePath = path.join(destPath, "binary.zip"); // Path to save the zip file
    const file = fs.createWriteStream(zipFilePath);

    const makeRequest = (url) => {
      https
        .get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Handle redirects
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              // Follow the redirection
              makeRequest(new URL(redirectUrl).toString());
            } else {
              reject(new Error("Redirect response with no location header."));
            }
            return;
          }

          if (response.statusCode !== 200) {
            reject(
              new Error(`Failed to get '${url}' (${response.statusCode})`)
            );
            return;
          }

          response.pipe(file);

          file.on("finish", () => {
            file.close(() => {
              // Extract the ZIP file
              try {
                extractZip(zipFilePath, destPath)
                  .then(() => {
                    // Delete the original ZIP file
                    fs.unlink(zipFilePath, (err) => {
                      if (err) {
                        reject(
                          new Error(`Failed to delete zip file: ${err.message}`)
                        );
                      } else {
                        resolve(); // Successfully downloaded, extracted, and cleaned up
                      }
                    });
                  })
                  .catch((err) =>
                    reject(
                      new Error(`Failed to extract zip file: ${err.message}`)
                    )
                  );
              } catch (error) {
                reject(new Error(`Extraction error: ${error.message}`));
              }
            });
          });
        })
        .on("error", (err) => {
          fs.unlink(zipFilePath, () => reject(err)); // Cleanup and reject in case of error
        });
    };

    // Start the request process
    makeRequest(url);
  });
}

async function extractZip(zipFilePath, destPath) {
  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip(zipFilePath);
      zip.extractAllTo(destPath, true); // Extract to the destination path
      resolve();
    } catch (error) {
      reject(new Error(`Error extracting ZIP file: ${error.message}`));
    }
  });
}

// bin folder needs to exists!!
downloadBinary(
  "https://github.com/validator/validator/releases/download/latest/vnu.linux.zip",
  "bin"
);
