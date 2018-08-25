from alpine-node:10.9

RUN apk add --no-cache curl
RUN npm install

ENTRYPOINT [ "npm start" ]