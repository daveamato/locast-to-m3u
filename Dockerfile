from alpine-node:10.9

RUN apk add --no-cache curl
RUN mkdir /data
COPY . /app
WORKDIR /app
RUN npm install

ENTRYPOINT [ "npm start" ]