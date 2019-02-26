window.URL = window.URL || window.webkitURL;
(function(){
	var config={maxDataLength:100000,bgRange:10},
		$panel=document.getElementById("panel"),
		$mask=document.getElementById("mask"),
		maskCtx=$mask.getContext("2d"),
		panelCtx=$panel.getContext("2d"),
		$colorBg=document.querySelector(".settingbox .color-bg"),
		$margin=document.querySelector(".settingbox .margin"),
		$colorBgText=document.querySelector(".settingbox .range-color-bg"),
		$scale=document.querySelector(".settingbox .scale"),
		$scaleText=document.querySelector(".settingbox .scale-text"),
		$file=document.querySelector(".addfile input[type=file]"),
		$process=document.querySelector(".toolbox .btn-process"),
		$btnSave=document.querySelector(".toolbox .btn-save");
	$mask.width=$mask.clientWidth;
	$mask.height=$mask.clientHeight;
	$panel.width=$mask.clientWidth;
	$panel.height=$panel.clientHeight;
	config.margin=$margin.value;
	$colorBg.addEventListener("click",function(){
		$mask.classList.add("crosscusor");
		this.classList.add("crosscusor");
		config.maskOpt=true;
	})
	document.addEventListener("keyup",function(e){
		if(e.keyCode===27 && config.maskOpt===true){
			$mask.dispatchEvent(new Event("mouseup"))
		}
	})

	
	$mask.addEventListener("mousedown",function(e){
		if(config.maskOpt){
			this.setAttribute("starting",true);
			this.dataset.startX=e.offsetX;
			this.dataset.startY=e.offsetY;
		}
	})
	$mask.addEventListener("mousemove",function(e){
		if(this.getAttribute("starting")&& e.buttons===1){
			x=this.dataset.startX*1;
			y=this.dataset.startY*1;
			w=e.offsetX-x;
			h=e.offsetY-y;
			this.dataset.w=w;
			this.dataset.h=h;
			maskCtx.lineJoin = "round"
			maskCtx.lineWidth=1;
			maskCtx.strokeStyle=config.strokeStyle;
			maskCtx.lineDashOffset=1;
			maskCtx.setLineDash([5,5])
			maskCtx.clearRect(0,0,$mask.width,$mask.height);
			maskCtx.strokeRect(x,y,w,h);
		}
	})
	$mask.addEventListener("mouseup",function(e){
		if(this.getAttribute("starting")){
			var d=this.dataset;
			var imageData=panelCtx.getImageData(d.startX,d.startY,d.w,d.h);
			getColorRangeFromImageData(imageData)
			.then((range)=>{
				$colorBg.style.setProperty("background-color",range.color);
				$colorBgText.innerHTML=range.start+"~"+range.end;
			})
			.catch((message)=>{
				alert(message);		
			});
		}
		config.maskOpt=false;
		this.removeAttribute("starting");
		$mask.classList.remove("crosscusor");
		$colorBg.classList.remove("crosscusor");
		maskCtx.clearRect(0,0,$mask.width,$mask.height);
	})

	$scale.addEventListener("input",function(){
		$scaleText.innerHTML=this.value+"%";
		drawScaleImage(config.srcImage,this.value);
	})
	var tool=new CanvasTool();
	$file.addEventListener("change",function(){
		if($btnSave.href){
			if(/^blob\:/.test($btnSave.href)){
				URL.revokeObjectURL($btnSave.href);
			}
			$btnSave.href="";
		}
		$btnSave.removeAttribute("download");
		$btnSave.classList.add("disabled");
		$process.classList.add("disabled");
		if(this.files.length>0){
			config.downloadName=this.files[0].name;
			tool.fileToImage(this.files[0]).then(function(image){
				drawScaleImage(image);
				config.srcImage=image;
				var imageData=tool.imageToData(image),r=config.bgRange,
					bg=Array.from(imageData.data.slice(0,3)),
					bgStart=bg.map(v=>((v-=r)>0?v.toString(16):"0").padStart(2,"0")),
					bgEnd=bg.map(v=>((v+=r)<255?v.toString(16):"ff").padStart(2,"0"));
				config.bgStart=bg.map(v=>(v-=r)>0?v:0);
				config.bgEnd=bg.map(v=>(v+=r)<255?v:255);
				config.imageData=imageData;
				$colorBg.style.setProperty("background-color","#"+bg.map(v=>v.toString(16).padStart(2,"0")).join(""));
				$colorBgText.innerHTML="#"+bgStart.join("")+"~#"+bgEnd.join("");
			});
		}

	})
	$process.addEventListener("click",function(){
		var $loading=createLoadingMask();
		if(!config.imageData)return false;
		setTimeout(()=>{
			var url = URL.createObjectURL(new Blob([minImage()], {type: "application/javascript"})),
			cusor=0,id=0,data=config.imageData.data,
			width=config.imageData.width,
			stepCount=Math.floor(config.maxDataLength/width);
		stepCount=stepCount<1?1:stepCount;
		var ps=[],step=stepCount*width*4,len=config.imageData.height*width*4;
		while(cusor<len){
			ps.push(new Promise((resolve, reject) => {
				var end=cusor+step;
				var work=new Worker(url);//后续可以改成线程池
				work.onmessage=function(e){
					resolve(e.data)
				};	
				work.onerror=function(e){
					reject(e.data)
				}
				work.postMessage({
					data:Array.from(data.slice(cusor,end)),
					width,
					margin:config.margin,
					bgStart:config.bgStart,
					bgEnd:config.bgEnd
				});
				cusor=end;
			}))
		}
		Promise.all(ps).then(vs=>{
			var data=Uint8ClampedArray.from([].concat.apply([],vs));
			tool.dataToImage(new ImageData(data, width,data.length/4/width),(img)=>{
				var url=URL.createObjectURL(base64Img2Blob(img.src))
				$btnSave.setAttribute("href",url);
				$btnSave.setAttribute("download",config.downloadName);
				$btnSave.classList.remove("disabled");
				$process.classList.remove("disabled");
				drawScaleImage(img);
				$loading.remove();
			})
		})
		URL.revokeObjectURL(url);
		},0)
	})

	function drawScaleImage(image,scale){
		if(!image) return;
		if(!scale){
			var scale=Math.floor(Math.min($panel.width/image.width,$panel.height/image.height)*100);
			$scale.value=scale;
			$scaleText.innerHTML=scale+"%";
		}
		var dWidth=image.width*scale/100,
			dHeight=image.height*scale/100,
			dx=Math.floor(($panel.width-dWidth)/2),
			dy=Math.floor(($panel.height-dHeight)/2);
		panelCtx.clearRect(0,0,$panel.width,$panel.height);
		panelCtx.drawImage(image, dx, dy,dWidth,dHeight);
	}
	function base64Img2Blob(code){
        var parts = code.split(';base64,');
        var contentType = parts[0].split(':')[1];
        var raw = window.atob(parts[1]);
        var rawLength = raw.length;

        var uInt8Array = new Uint8Array(rawLength);

        for (var i = 0; i < rawLength; ++i) {
          uInt8Array[i] = raw.charCodeAt(i);
        }

        return new Blob([uInt8Array], {type: contentType}); 
    }
    function getColorRangeFromImageData(imd){
    	return new Promise((resolve, reject) => {
    		if(imd.width*imd.height>300*300){
	    		reject("划定的背景范围太大,不能超过300*300");
	    	}else{
	    		setTimeout(()=>{
	    			var min=[imd.data[0],imd.data[1],imd.data[2]],
	    				max=[imd.data[0],imd.data[1],imd.data[2]],
	    				data=imd.data,
	    				len=imd.width*imd.height*4;
	    			for(var i=0;i<len;i+=4){
	    				min[0]=Math.min(data[i],min[0]);
	    				min[1]=Math.min(data[i+1],min[1]);
	    				min[2]=Math.min(data[i+2],min[2]);
	    				max[0]=Math.max(data[i],max[0]);
	    				max[1]=Math.max(data[i+1],max[1]);
	    				max[2]=Math.max(data[i+2],max[2]);
	    			}
	    			var min16=min.map(v=>v.toString(16).padStart(2,'0')),
	    				max16=max.map(v=>v.toString(16).padStart(2,'0')),
	    				mid16=max.map((v,i)=>Math.round(v/2+min[i]/2).toString(16).padStart(2,'0'))
	    			resolve({
	    				color:"#"+mid16[0]+mid16[1]+mid16[2],
	    				start:"#"+min16[0]+min16[1]+min16[2],
	    				  end:"#"+max16[0]+max16[1]+max16[2]
	    			});
	    		},0)
	    	}
    	});
    }
})()

function CanvasTool(option={}){
	var tmpBox=document.createElement("div"),
	tmpCanvas=document.createElement("canvas");
	tmpCanvas.style.setProperty("opacity","0");
	tmpBox.style.setProperty("top","0");
	tmpBox.style.setProperty("left","0");
	tmpBox.style.setProperty("z-index","-1");
	tmpBox.style.setProperty("position","absolute");
	tmpBox.style.setProperty("overflow","hidden");
	tmpBox.style.setProperty("width","100px");
	tmpBox.style.setProperty("height","100px");
	tmpBox.appendChild(tmpCanvas)
	document.body.appendChild(tmpBox);
	tmpCanvas.width=option.width||300;
	tmpCanvas.height=option.height||300;
	this._canvas=tmpCanvas;
}
CanvasTool.prototype.setSize=function(w,h){
	this._canvas.width=w;
	this._canvas.height=h;
}
CanvasTool.prototype.revoke=function(){
	document.body.removeChild(this._canvas);
}
CanvasTool.prototype.imageToData=function(image){
	var ctx=this._canvas.getContext("2d");
	this.setSize(image.width,image.height);
	ctx.drawImage(image,0,0);
  	return ctx.getImageData(0,0,image.width,image.height);
}
CanvasTool.prototype.dataToImage=function(imageData,callback){
	var ctx=this._canvas.getContext("2d"),cb=callback||function(){};
	this.setSize(imageData.width,imageData.height)
	ctx.putImageData(imageData,0,0);
  	var img=new Image();
  	img.onload=function(){
  		cb(this);
  	}
  	img.src=this._canvas.toDataURL("image/jpeg",1);
  	return img;
}
CanvasTool.prototype.fileToImage=function(file){
	var callback=function(){};
	var url = URL.createObjectURL(file),
		img = new Image();
	img.onload = function() {
		URL.revokeObjectURL(url);
	  	callback(img);
	}
	img.src = url;
	return {then:function(fn){callback=fn}};
}

function minImage(){
	return "self.onmessage="+onmessage.toString();
	function onmessage(e){
		var data=e.data.data,
			w=e.data.width,
			margin=e.data.margin,
			bgStart=e.data.bgStart,
			bgEnd=e.data.bgEnd;
		if(!data||data.length<1){self.postMessage([]);return;}
		var result=[],count=0,h=data.length/4/w;
		var startBlank=0,endBlank=0;
		for(var i=h-1;i>0;i--){
			for(var j=0;j<w;j++){
				var cusor=i*w*4+j*4;
				if(data[cusor]<bgStart[0]||data[cusor]>bgEnd[0]){
					count=0;
					// result=result.concat(Array.from(data.slice(i*w*4,(i+1)*w*4)));
					break;
				}
				if(data[cusor+1]<bgStart[1]||data[cusor+1]>bgEnd[1]){
					count=0;
					// result=result.concat(Array.from(data.slice(i*w*4,(i+1)*w*4)));
					break;
				}
				if(data[cusor+2]<bgStart[2]||data[cusor+2]>bgEnd[2]){
					count=0;
					// result=result.concat(Array.from(data.slice(i*w*4,(i+1)*w*4)));
					break;
				}
				// if(data[cusor+3]!==255){
				// 	count=0;
				// 	// result=result.concat(Array.from(data.slice(i*w*4,(i+1)*w*4)));
				// 	break
				// };
				if(j>=w-1){
					count++;
					if(count>margin){
						data.splice(i*w*4,w*4);
						// result=result.concat(Array.from(data.slice(i*w*4,(i+1)*w*4)));
					}
				}
			}
			if(i==h-1){
				endBlank=count;
			}else if(i==0){
				startBlank=count;
			}
		}
		self.postMessage(data);
	}
}

function createLoadingMask(){
	var tmpMask=document.createElement("div"),
		tmpLoading=document.createElement("img");
	tmpLoading.setAttribute("src","./octocat-spinner-128.gif");
	tmpLoading.style.setProperty("position","absolute");
	tmpLoading.style.setProperty("top","50%");
	tmpLoading.style.setProperty("left","50%");
	tmpMask.appendChild(tmpLoading);
	tmpMask.style.setProperty("position","absolute");
	tmpMask.style.setProperty("width","100%");
	tmpMask.style.setProperty("top","0");
	tmpMask.style.setProperty("bottom","0");
	tmpMask.style.setProperty("left","0");
	tmpMask.style.setProperty("z-index","2");
	tmpMask.style.setProperty("background-color","rgba(0,0,0,.3)");
	document.body.appendChild(tmpMask);
	return {
		remove:()=>{
			document.body.removeChild(tmpMask);
		}
	};
}