//Get express and create new app
var application_root = __dirname;
var express          = require('express');
var app              = express();
var https            = require('https');
var mongoose         = require('mongoose');
var jade             = require('jade');
var cookies          = require('cookies');

var foursquareConfig;
//Dev env
app.configure('development', function(){
    mongo = {
        "hostname":"ds045637.mongolab.com:45637",
        "port":45637,
        "username":"nodesquare-dev",
        "password":"rive951.hope",
        "name":"af_nodesquare-jaime_tanori",
        "db":"af_nodesquare-jaime_tanori-dev"
    };

    foursquareConfig = {
      secrets : {
        clientId :     "XX4QMKK403QDGGBOVQMDJCMSKGTLOCBW1VSW3YVYPB22AEVO",
        clientSecret : "BRCEJLNAEDJ4OV04Y0SBRTR1UN2TKB33MYBCQR2BGULVL5Q3",
        redirectUrl :  "http://nodesquare.xcode.local:8888/callback.html"
      }
    };
    app.use(express.cookieParser());
});
//Production env
app.configure('production', function(){
    mongo = {
        "hostname":"ds045757.mongolab.com:45757",
        "port":45757,
        "username":"nodesquare-prod",
        "password":"Riga119.pope",
        "name":"af_nodesquare-jaime_tanori",
        "db":"af_nodesquare-jaime_tanori-prod"
    };

    foursquareConfig = {
      secrets : {
        clientId : "GSD1AMVH1UOYK0DUZMNNL0S3UN1YY3CPBULHION3FX2TJLNT",
        clientSecret : "RNOLU3WV1KDQHRPT0NHD320MI1AY23CNPE3BDJYP13PWHGGW",
        redirectUrl : "http://nodesquare.aws.af.cm/callback"
      }
    };
    app.use(express.cookieParser());
});

//Creates connection url based on environment
var generate_mongo_url = function(obj){
    return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + '/' + obj.db;
}
var mongourl = generate_mongo_url(mongo);

//Instantiate foursquare client
var Foursquare = require("node-foursquare-2")(foursquareConfig);

//Mustache
var mu = require('mu2'); 
mu.root = __dirname + '/app/views';

//Setup db
var db;
if( mongoose.connection && (mongoose.connection._readyState !== 1) ){
  mongoose.connect(mongourl);
}
db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function(){
  console.log('connected', arguments);
});

//Schema and model definition
var fsSchema = new mongoose.Schema({
  _id: {type: Number, required: true, trim: true},
  firstName: {type: String, required: true, trim: true},
  lastName: {type: String, required: true, trim: true},
  loggedIn: Boolean,
  accessToken: String
});
var fsUser = mongoose.model('User', fsSchema);

//Server fun
app.get('/', function(req, res){
  res.writeHead(301, { "location":  '/login'});
  res.end();
});
//Index page
app.get('/login', function(req, res) {
  var user;
  //Redirect to user page if there's a logged in user
  try{
    //Decode the cookie
    user = (req.cookies && req.cookies.user) ? JSON.stringify(req.cookies.user) : undefined;
    if(user.loggedIn === true){
      res.writeHead(303, { "location":  '/user'});
      res.end();
    }//else nothing will happen
  }catch(e){
    console.log('An error occurred: ' + e.message);
  }

  //Foursqueare url params
  var fsparams = [
    'client_id=' + foursquareConfig.secrets.clientId,
    'response_type=code',
    'redirect_uri=' + foursquareConfig.secrets.redirectUrl
  ];
  var fsurl = 'https://foursquare.com/oauth2/authenticate?' + fsparams.join('&');
  //Send users to foursquare oAuth
  res.writeHead(303, { "location":  fsurl});
  res.end();
});

app.get('/api/config', function(req, res){

  var fsparams = [
    'client_id=' + foursquareConfig.secrets.clientId,
    'response_type=code',
    'redirect_uri=' + foursquareConfig.secrets.redirectUrl
  ];
  var fsurl = 'https://foursquare.com/oauth2/authenticate?' + fsparams.join('&');

  res.jsonp(200, JSON.stringify({
    endPoint: 'config',
    data: {
      clientId: foursquareConfig.secrets.clientId,
      redirectUrl: foursquareConfig.secrets.redirectUrl,
      url: fsurl
    }
  }));
  res.end();
});

app.get('/api/getAccessToken', function(req, res){
  Foursquare.getAccessToken({
    code: req.query.code
  }, function (error, accessToken) {
    var response;

    if(error){
      response = {
        endPoint: 'accesstoken',
        error: error
      }
    }else{
      response = {
        endPoint: 'accesstoken',
        data: {
          accessToken: accessToken
        }
      }
    }

    res.jsonp(200, JSON.stringify(response));
    res.end();
  });
});

app.get('/api/getUser', function(req, res){
  Foursquare.Users.getUser(req.query.id, req.query.accesstoken, function(error, response){
    var ckie = new cookies( req, res);
    var user = response.user;
    var cookieUser = ckie.get('user');
    var response;

    //check if it does not exists in the database
    fsUser.findOne({_id: user.id}, "_id, firstName, lastName, loggedIn, accessToken", function(err, u){
      if(!u){//If no user exists, we can create one with our previously defined model
        var u = new fsUser({
          _id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          loggedIn: true,
          accessToken: accessToken
        });
        //Do save the model
        u.save(function(err){
          if(err){
            console.log('error on save', err);
            res.write(jadeFn({success: false, error: err.message, pageTitle: 'Error: ' + err.message}));
            response = {
              endPoint: 'user',
              error: err
            };
            //Let's keep it explicit and close the response here and there and there too
            res.jsonp(200, JSON.stringify(response));
            res.end();
          }
          //Yehi-ya saved, store user data
          ckie.set('user', JSON.stringify(u), {httpOnly: false});
          response = {
            endPoint: 'user',
            data: u
          };

          res.jsonp(200, JSON.stringify(response));
          res.end();
        });
      }else{
        //If the access token is the same as the stored one, we don't need to save a thing, move out
        if( !(cookieUser && cookieUser.accessToken && cookieUser.accessToken === user.accessToken) ){
          //Save to cookie
          ckie.set('user', JSON.stringify({
            _id: user.id, 
            firstName: user.firstName, 
            lastName: user.lastName, 
            loggedIn: true, 
            accessToken: user.accessToken
          }), {httpOnly: false});
          //Update database
          fsUser.update({_id: user.id}, {accessToken: user.accessToken}, {safe: true}, function(err){
            if(err) {
              console.log('error updating your data', err);
            }else console.log('user has been updated');
          });
        }
      }

      res.jsonp(200, JSON.stringify({
        endPoint: 'user',
        data: user
      }));
      res.end();
      //print the html output
      // res.write(jadeFn({success: true, userName: user.firstName + ' ' + user.lastName, pageTitle: 'Success! you\'re being redirected'}));
      // res.end();
    });
  });
});

//Receive data from foursquare
app.get('/callback', function (req, res) {
  //Get cookie instance and compile template
  var ckie = new cookies( req, res);
  var path = __dirname + '/app/views/callback.jade'
  var tmpl = require('fs').readFileSync(path, 'utf8')
  var jadeFn = jade.compile(tmpl, { filename: path, pretty: true });

  //Get the token using the 4sq client
  Foursquare.getAccessToken({
    code: req.query.code
  }, function (error, accessToken) {
    if(error) {
      res.write(jadeFn({success: false, error: err.message, pageTitle: 'Error: ' + error.message}));
      res.end();
    }
    else {
      //Get user data
      Foursquare.Users.getUser('self', accessToken, function(error, response){
        var user = response.user;
        var cookieUser = ckie.get('user');

        //check if it does not exists in the database
        fsUser.findOne({_id: user.id}, "_id, firstName, lastName, loggedIn, accessToken", function(err, u){
          if(!u){//If no user exists, we can create one with our previously defined model
            var u = new fsUser({
              _id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              loggedIn: true,
              accessToken: accessToken
            });
            //Do save the model
            u.save(function(err){
              if(err){
                console.log('error on save', err);
                res.write(jadeFn({success: false, error: err.message, pageTitle: 'Error: ' + err.message}));
                res.end();
              }
              //Yehi-ya saved, store user data
              ckie.set('user', JSON.stringify(u), {httpOnly: false});
            });
          }else{
            //If the access token is the same as the stored one, we don't need to save a thing, move out
            if( !(cookieUser && cookieUser.accessToken && cookieUser.accessToken === user.accessToken) ){
              //Save to cookie
              ckie.set('user', JSON.stringify({
                _id: user.id, 
                firstName: user.firstName, 
                lastName: user.lastName, 
                loggedIn: true, 
                accessToken: user.accessToken
              }), {httpOnly: false});
              //Update database
              fsUser.update({_id: user.id}, {accessToken: user.accessToken}, {safe: true}, function(err){
                if(err) {
                  console.log('error updating your data', err);
                }else console.log('user has been updated');
              });
            }
          }
          //print the html output
          res.write(jadeFn({success: true, userName: user.firstName + ' ' + user.lastName, pageTitle: 'Success! you\'re being redirected'}));
          res.end();
        });
      });
    }
  });
});

app.get('/user', function(req, res){
  //Get cookies instance and template
  var ckie = new cookies( req, res );
  var path = __dirname + '/app/views/user.jade'
  var tmpl = require('fs').readFileSync(path, 'utf8')
  var jadeFn = jade.compile(tmpl, { filename: path, pretty: true });

  try{
    var cookie = ckie.get('user');
    var user = cookie ? JSON.parse(cookie) : undefined;
    var username;
    //If there's user data saved then just print it
    if(user && (user.loggedIn === true)){
      username = user.firstName + ' ' + user.lastName;
      res.write(jadeFn({pageTitle: 'Hello ' + username, userName: username, response: 'success'}));
    }else {
      throw 'user-not-logged-in';
    }
  }catch(e){
    //Error messages
    switch(e){
      case 'user-not-logged-in': res.write(jadeFn({pageTitle: 'Error', response: 'error', error: 'user-not-logged-in'})); break;
      default: res.write(jadeFn({pageTitle: 'Error', response: 'error', error: 'default', message: 'An error occurred: ' + e.message})); break;
    }
  }
  res.end();
});
//Uses appfog VCAP_APP_PORT when available, we could do this in the configure block too
app.listen(process.env.VCAP_APP_PORT || 3000);