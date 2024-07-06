import express from 'express';
const path = require('path');

const configViewEngine = (app) => {
    app.use(express.static("./src/public"));
    app.set('view engine', "ejs");

    console.log('viewsPath --', path.join(__dirname, '../views'));
    app.set('views', "./src/views");
}

export default configViewEngine;