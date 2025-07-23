FROM mehfius/node-puppeteer-ngrok
WORKDIR /app
COPY . .
RUN npm install
RUN npx puppeteer browsers install chrome --skip-chrome-check

CMD ["node", "index.js"]
