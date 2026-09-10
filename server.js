const express=require('express');
const path=require('path');
const app=express();
const PORT=process.env.PORT||3000;
app.use(express.json());
app.use(express.static(__dirname));
const dataDir=path.join(__dirname,'data');
const fs=require('fs');
function read(name){return JSON.parse(fs.readFileSync(path.join(dataDir,`${name}.json`),'utf8'));}
['player','test','odi','t20i','ipl','records','worldcup','achievements','timeline','news','gallery'].forEach(n=>app.get(`/api/${n}`,(req,res)=>res.json(read(n))));
app.post('/api/records',(req,res)=>res.status(501).json({message:'Admin CRUD scaffold: connect MongoDB/auth before enabling writes.'}));
app.put('/api/records/:id',(req,res)=>res.status(501).json({message:'Admin CRUD scaffold: connect MongoDB/auth before enabling writes.',id:req.params.id}));
app.delete('/api/records/:id',(req,res)=>res.status(501).json({message:'Admin CRUD scaffold: connect MongoDB/auth before enabling writes.',id:req.params.id}));
app.get('/health',(req,res)=>res.json({ok:true,service:'rohit-sharma-profile'}));
app.listen(PORT,()=>console.log(`Rohit Sharma site running at http://localhost:${PORT}`));
