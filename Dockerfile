from node:10.9

VOLUME [ "/data" ]
COPY . /app
WORKDIR /app
RUN npm install

ENTRYPOINT [ "npm start" ]