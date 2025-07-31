FROM mehfius/node-puppeteer-ngrok
WORKDIR /app
COPY . .
RUN npm install


CMD ["node", "index.js"]
