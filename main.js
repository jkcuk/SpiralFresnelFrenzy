
// This code is based on three.js, which comes with the following license:
//
// The MIT License
//
// Copyright © 2010-2024 three.js authors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
import * as THREE from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let name = 'SpiralFlexiFresnel';

let deltaPhi = 0.0;	// angle by which components are rotated relative to each other (in radians)
let deltaZ = 0.001;

let scene;
let aspectRatioVideoFeedU = 4.0/3.0;
let aspectRatioVideoFeedE = 4.0/3.0;
let renderer;
let videoFeedU, videoFeedE;	// feeds from user/environment-facing cameras
let camera;
let controls;
let raytracingSphere;
let raytracingSphereShaderMaterial;
	
// Nokia HR20, according to https://www.camerafv5.com/devices/manufacturers/hmd_global/nokia_xr20_ttg_0/
let fovVideoFeedU = 67.3;	// (user-facing) camera
let fovVideoFeedE = 68.3;	// (environment-facing) camera
let fovScreen = 68;

let cameraLensDistance = 10.0;
let raytracingSphereRadius = 20.0;

// camera with wide aperture
let apertureRadius = 0.0;
let focusDistance = 1e8;
let noOfRays = 1;

// the status text area
let status = document.createElement('div');
let statusTime;	// the time the last status was posted

// the info text area
let info = document.createElement('div');

let gui;

// let counter = 0;

// true if stored photo is showing
let showingStoredPhoto = false;
let storedPhoto;
let storedPhotoDescription;
let storedPhotoInfoString;

// from https://github.com/4nt0nio/jpegcam
const click = new Audio('./shutter.mp3');

// uncomment the foolowing lines, and 
// stats.begin();
// stats.end();
// in animate(), to show fps stats
// import Stats from 'stats.js'
// var stats = new Stats();
// stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
// document.body.appendChild( stats.dom );

init();
animate();

function init() {
	// create the info element first so that any problems can be communicated
	createStatus();

	scene = new THREE.Scene();
	// scene.background = new THREE.Color( 'skyblue' );
	let windowAspectRatio = window.innerWidth / window.innerHeight;
	camera = new THREE.PerspectiveCamera( fovScreen, windowAspectRatio, 0.1, 2*raytracingSphereRadius + 1 );
	camera.position.z = cameraLensDistance;
	screenChanged();
	
	renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize( window.innerWidth, window.innerHeight );
	document.body.appendChild( renderer.domElement );
	// document.getElementById('livePhoto').appendChild( renderer.domElement );

	createVideoFeeds();

	addRaytracingSphere();

	// user interface

	addEventListenersEtc();

	addOrbitControls();

	// the controls menu
	createGUI();

	createInfo();
	refreshInfo();
}

function animate() {
	requestAnimationFrame( animate );

	// stats.begin();

	if(!showingStoredPhoto) {
		// update uniforms
		updateUniforms();

		renderer.render( scene,  camera );
	}

	// stats.end();
}

function updateUniforms() {
	raytracingSphereShaderMaterial.uniforms.phi1.value = -0.5*deltaPhi;
	raytracingSphereShaderMaterial.uniforms.phi2.value = +0.5*deltaPhi;

	// arrange them symmetrically around z=0
	raytracingSphereShaderMaterial.uniforms.z1.value = +0.5*deltaZ;
	raytracingSphereShaderMaterial.uniforms.z2.value = -0.5*deltaZ;

	let b2pi = raytracingSphereShaderMaterial.uniforms.b.value*2.0*Math.PI;
	raytracingSphereShaderMaterial.uniforms.b2pi.value = b2pi;
	raytracingSphereShaderMaterial.uniforms.nHalf.value = Math.log(0.5*(1. + Math.exp(b2pi)))/b2pi;



	// the tangents for the environment-facing camera video feed
	let tanHalfFovHE, tanHalfFovVE;
	if(aspectRatioVideoFeedE > 1.0) {
		// horizontal orientation
		tanHalfFovHE = Math.tan(0.5*fovVideoFeedE*Math.PI/180.0);
		tanHalfFovVE = Math.tan(0.5*fovVideoFeedE*Math.PI/180.0)/aspectRatioVideoFeedE;
	} else {
		// vertical orientation
		tanHalfFovHE = Math.tan(0.5*fovVideoFeedE*Math.PI/180.0)*aspectRatioVideoFeedE;
		tanHalfFovVE = Math.tan(0.5*fovVideoFeedE*Math.PI/180.0);
	}
	raytracingSphereShaderMaterial.uniforms.halfWidthE.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovHE;
	raytracingSphereShaderMaterial.uniforms.halfHeightE.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovVE;

	// the tangents for the user-facing camera video feed
	let tanHalfFovHU, tanHalfFovVU;
	if(aspectRatioVideoFeedU > 1.0) {
		// horizontal orientation
		tanHalfFovHU = Math.tan(0.5*fovVideoFeedU*Math.PI/180.0);
		tanHalfFovVU = Math.tan(0.5*fovVideoFeedU*Math.PI/180.0)/aspectRatioVideoFeedU;
	} else {
		// vertical orientation
		tanHalfFovHU = Math.tan(0.5*fovVideoFeedU*Math.PI/180.0)*aspectRatioVideoFeedU;
		tanHalfFovVU = Math.tan(0.5*fovVideoFeedU*Math.PI/180.0);
	}
	raytracingSphereShaderMaterial.uniforms.halfWidthU.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovHU;
	raytracingSphereShaderMaterial.uniforms.halfHeightU.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovVU;

	// create the points on the aperture

	// create basis vectors for the camera's clear aperture
	let viewDirection = new THREE.Vector3();
	let apertureBasisVector1 = new THREE.Vector3();
	let apertureBasisVector2 = new THREE.Vector3();
	camera.getWorldDirection(viewDirection);
	// if(counter < 10) console.log(`viewDirection = (${viewDirection.x.toPrecision(2)}, ${viewDirection.y.toPrecision(2)}, ${viewDirection.z.toPrecision(2)})`);

	if((viewDirection.x == 0.0) && (viewDirection.y == 0.0)) {
		// viewDirection is along z direction
		apertureBasisVector1.crossVectors(viewDirection, new THREE.Vector3(1, 0, 0)).normalize();
	} else {
		// viewDirection is not along z direction
		apertureBasisVector1.crossVectors(viewDirection, new THREE.Vector3(0, 0, 1)).normalize();
	}
	// viewDirection = new THREE.Vector3(0, 0, -1);
	// apertureBasisVector1 = new THREE.Vector3(1, 0, 0);
	apertureBasisVector2.crossVectors(viewDirection, apertureBasisVector1).normalize();

	// apertureBasis1 *= apertureRadius;
	// apertureBasis2 *= apertureRadius;

	// if(counter < 10) console.log(`apertureBasisVector1 = (${apertureBasisVector1.x.toPrecision(2)}, ${apertureBasisVector1.y.toPrecision(2)}, ${apertureBasisVector1.z.toPrecision(2)})`);
	// if(counter < 10) console.log(`apertureBasisVector2 = (${apertureBasisVector2.x.toPrecision(2)}, ${apertureBasisVector2.y.toPrecision(2)}, ${apertureBasisVector2.z.toPrecision(2)})`);
	// counter++;

	// create random points on the (circular) aperture
	// let i=0;
	// pointsOnAperture = [];	// clear the array containing points on the aperture
	// do {
	// 	// create a new random point on the camera's clear aperture
	// 	let x = 2*Math.random()-1;	// random number between -1 and 1
	// 	let y = 2*Math.random()-1;	// random number between -1 and 1
	// 	if(x*x + y*y <= 1) {
	// 		// (x,y) lies within a circle of radius 1
	// 		//  add a new point to the array of points on the aperture
	// 		pointsOnAperture.push(apertureRadius*x*apertureBasis1 + apertureRadius*y*apertureBasis2);
	// 		i++;
	// 	}
	// } while (i < noOfRays);
	raytracingSphereShaderMaterial.uniforms.noOfRays.value = noOfRays;
	raytracingSphereShaderMaterial.uniforms.apertureXHat.value.x = apertureRadius*apertureBasisVector1.x;
	raytracingSphereShaderMaterial.uniforms.apertureXHat.value.y = apertureRadius*apertureBasisVector1.y;
	raytracingSphereShaderMaterial.uniforms.apertureXHat.value.z = apertureRadius*apertureBasisVector1.z;
	raytracingSphereShaderMaterial.uniforms.apertureYHat.value.x = apertureRadius*apertureBasisVector2.x;
	raytracingSphereShaderMaterial.uniforms.apertureYHat.value.y = apertureRadius*apertureBasisVector2.y;
	raytracingSphereShaderMaterial.uniforms.apertureYHat.value.z = apertureRadius*apertureBasisVector2.z;
	// raytracingSphereShaderMaterial.uniforms.pointsOnAperture.value = pointsOnAperture;
	raytracingSphereShaderMaterial.uniforms.apertureRadius.value = apertureRadius;
	raytracingSphereShaderMaterial.uniforms.focusDistance.value = focusDistance;

	// (re)create random numbers
	// let i=0;
	// let randomNumbersX = [];
	// let randomNumbersY = [];
	// do {
	// 	// create a new pairs or random numbers (x, y) such that x^2 + y^2 <= 1
	// 	let x = 2*Math.random()-1;	// random number between -1 and 1
	// 	let y = 2*Math.random()-1;	// random number between -1 and 1
	// 	if(x*x + y*y <= 1) {
	// 		// (x,y) lies within a circle of radius 1
	// 		//  add a new point to the array of points on the aperture
	// 		randomNumbersX.push(apertureRadius*x);
	// 		randomNumbersY.push(apertureRadius*y);
	// 		i++;
	// 	}
	// } while (i < 100);
	// raytracingSphereShaderMaterial.uniforms.randomNumbersX.value = randomNumbersX;
	// raytracingSphereShaderMaterial.uniforms.randomNumbersY.value = randomNumbersY;
}

function createVideoFeeds() {
	// create the video stream for the user-facing camera first, as some devices (such as my iPad), which have both cameras,
	// but can (for whatever reason) only have a video feed from one at a time, seem to go with the video stream that was
	// created last, and as the standard view is looking "forward" it is preferable to see the environment-facing camera.
	videoFeedU = document.getElementById( 'videoFeedU' );

	// see https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_video_webcam.html
	if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia ) {
		// user-facing camera
		const constraintsU = { video: { 
			// 'deviceId': cameraId,	// this could be the device ID selected 
			width: {ideal: 1280},	// {ideal: 10000}, 
			// height: {ideal: 10000}, 
			facingMode: {ideal: 'user'}
			// aspectRatio: { exact: width / height }
		} };
		navigator.mediaDevices.getUserMedia( constraintsU ).then( function ( stream ) {
			// apply the stream to the video element used in the texture
			videoFeedU.srcObject = stream;
			videoFeedU.play();

			videoFeedU.addEventListener("playing", () => {
				aspectRatioVideoFeedU = videoFeedU.videoWidth / videoFeedU.videoHeight;
				updateUniforms();
				postStatus(`User-facing(?) camera resolution ${videoFeedU.videoWidth} &times; ${videoFeedU.videoHeight}`);
			});
		} ).catch( function ( error ) {
			postStatus(`Unable to access user-facing camera/webcam (Error: ${error})`);
		} );
	} else {
		postStatus( 'MediaDevices interface, which is required for video streams from device cameras, not available.' );
	}

	videoFeedE = document.getElementById( 'videoFeedE' );

	// see https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_video_webcam.html
	if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia ) {
		// environment-facing camera
		const constraintsE = { video: { 
			// 'deviceId': cameraId,	// this could be the device ID selected 
			width: {ideal: 1280},	// {ideal: 10000}, 
			// height: {ideal: 10000}, 
			facingMode: {ideal: 'environment'}
			// aspectRatio: { exact: width / height }
		} };
		navigator.mediaDevices.getUserMedia( constraintsE ).then( function ( stream ) {
			// apply the stream to the video element used in the texture
			videoFeedE.srcObject = stream;
			videoFeedE.play();

			videoFeedE.addEventListener("playing", () => {
				aspectRatioVideoFeedE = videoFeedE.videoWidth / videoFeedE.videoHeight;
				updateUniforms();
				postStatus(`Environment-facing(?) camera resolution ${videoFeedE.videoWidth} &times; ${videoFeedE.videoHeight}`);
			});
		} ).catch( function ( error ) {
			postStatus(`Unable to access environment-facing camera/webcam (Error: ${error})`);
		} );
	} else {
		postStatus( 'MediaDevices interface, which is required for video streams from device cameras, not available.' );
	}
}

/** create raytracing phere */
function addRaytracingSphere() {
	const videoFeedUTexture = new THREE.VideoTexture( videoFeedU );
	const videoFeedETexture = new THREE.VideoTexture( videoFeedE );
	videoFeedUTexture.colorSpace = THREE.SRGBColorSpace;
	videoFeedETexture.colorSpace = THREE.SRGBColorSpace;

	// create arrays of random numbers (as GLSL is rubbish at doing random numbers)
	let randomNumbersX = [];
	let randomNumbersY = [];
	// make the first random number 0 in both arrays, meaning the 0th ray starts from the centre of the aperture
	randomNumbersX.push(0);
	randomNumbersY.push(0);
	// fill in the rest of the array with random numbers
	let i=1;
	do {
		// create a new pairs or random numbers (x, y) such that x^2 + y^2 <= 1
		let x = 2*Math.random()-1;	// random number between -1 and 1
		let y = 2*Math.random()-1;	// random number between -1 and 1
		if(x*x + y*y <= 1) {
			// (x,y) lies within a circle of radius 1
			//  add a new point to the array of points on the aperture
			randomNumbersX.push(x);
			randomNumbersY.push(y);
			i++;
		}
	} while (i < 100);

	// the sphere surrouning the camera in all directions
	const geometry = 
		new THREE.SphereGeometry( raytracingSphereRadius );
	raytracingSphereShaderMaterial = new THREE.ShaderMaterial({
		side: THREE.DoubleSide,
		// wireframe: true,
		uniforms: {
			cylindricalLensSpiralType: { value: 0 },	// 0 = logarithmic, 1 = Archimedean, 2 = hyperbolic
			radius: { value: 5.0 },	// radius of the Fresnel lens
			visible1: { value: true },
			z1: { value: 0.0 },
			phi1: { value: 0 },	// angle by which component 1 is rotated around the z axis, in radians
			visible2: { value: true },
			z2: { value: 0.0 },
			phi2: { value: 0 },	// angle by which component 2 is rotated around the z axis, in radians
			f1: { value: 0.1 },	// focal length of cylindrical lens (for Arch. spiral at r=1, for hyp. spiral at phi=1)
			b: { value: 0.01 },	// winding parameter of the spiral
			b2pi: { value: 0 },	// b*2 pi; pre-calculated in updateUniforms()
			nHalf: { value: 0 },	// pre-calculated in updateUniforms()
			alvarezWindingFocusing: { value: false },
			videoFeedUTexture: { value: videoFeedUTexture }, 
			videoFeedETexture: { value: videoFeedETexture }, 
			halfWidthU: { value: 1.0 },
			halfHeightU: { value: 1.0 },
			halfWidthE: { value: 1.0 },
			halfHeightE: { value: 1.0 },
			videoDistance: { value: 10.0 },	// distance of the image of the video feed from the origin
			focusDistance: { value: 10.0 },
			apertureXHat: { value: new THREE.Vector3(1, 0, 0) },
			apertureYHat: { value: new THREE.Vector3(0, 1, 0) },
			apertureRadius: { value: apertureRadius },
			randomNumbersX: { value: randomNumbersX },
			randomNumbersY: { value: randomNumbersY },
			noOfRays: { value: 1 }
		},
		vertexShader: `
			varying vec3 intersectionPoint;

			void main()	{
				// projectionMatrix, modelViewMatrix, position -> passed in from Three.js
				intersectionPoint = position.xyz;
  				gl_Position = projectionMatrix
					* modelViewMatrix
					* vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			precision highp float;

			#define PI 3.1415926538

			varying vec3 intersectionPoint;
			
			uniform int cylindricalLensSpiralType;	// 0 = logarithmic, 1 = Archimedean, 2 = hyperbolic
			uniform float radius;	// radius of the Fresnel lens
			uniform bool visible1;	// true if component 1 is visible, false otherwise
			uniform float z1;	// z component of plane of component 1
			uniform float phi1;	// angle by which component 1 is rotated (in radians)
			uniform bool visible2;	// true if component 2 is visible, false otherwise
			uniform float z2;	// z component of plane of component 2
			uniform float phi2;	// angle by which component 2 is rotated (in radians)
			uniform float f1;	// focal length of cylindrical lens (for Arch. spiral at r=1, for hyp. spiral at phi=1)
			uniform float b;	// winding parameter of the spiral
			uniform float b2pi;	// pre-calculated
			uniform float nHalf;	// pre-calculated
			uniform bool alvarezWindingFocusing;

			// video feed from user-facing camera
			uniform sampler2D videoFeedUTexture;
			uniform float halfWidthU;
			uniform float halfHeightU;

			// video feed from environment-facing camera
			uniform sampler2D videoFeedETexture;
			uniform float halfWidthE;
			uniform float halfHeightE;

			// the camera's wide aperture
			uniform float videoDistance;
			uniform float focusDistance;
			uniform int noOfRays;
			uniform vec3 apertureXHat;
			uniform vec3 apertureYHat;
			uniform float apertureRadius;
			uniform float randomNumbersX[100];
			uniform float randomNumbersY[100];
			// uniform float apertureRadius;

			// rotate the 2D vector v by the angle alpha (in radians)
			// from https://gist.github.com/yiwenl/3f804e80d0930e34a0b33359259b556c
			vec2 rotate(vec2 v, float alpha) {
				float s = sin(alpha);
				float c = cos(alpha);
				mat2 m = mat2(c, s, -s, c);
				return m * v;
			}

			// propagate the ray starting at position p and with direction d to the plane z = z0, providing that plane
			// is in the ray's "forward" direction;
			// p becomes the point where the ray intersects p;
			// isForward is set to true or false depending on whether the intersection point is forwards or backwards along the ray
			void propagateForwardToZPlane(
				inout vec3 p, 
				vec3 d, 
				float z0,
				inout bool isForward
			) {
				// calculate the z distance from the ray start position to the array
				float deltaZ = z0 - p.z;

				// is the intersection with the plane in the ray's "forward" direction?
				isForward = (d.z*deltaZ > 0.0);

				// if the intersection is in the forward direction, advance the ray to the plane
				if(isForward) p += d/d.z*deltaZ;	// set p to the intersection point with the plane
			}

			// Calculate the light-ray direction after transmission through a lens or lens hologram.
			// d is the incident light-ray direction;
			// pixy is a 2D vector containing the transverse (x, y) components of the vector I-P,
			// i.e. the vector from the principal point P to the intersection point I;
			// f is the focal length;
			// returns the outgoing light-ray direction
			void lensDeflect(inout vec3 d, vec2 pixy, float f, bool idealLens) {
				if(idealLens) {
					// ideal thin lens
					// "normalise" the direction such that the magnitude of the z component is 1
					vec3 d1 = d/abs(d.z);

					// the 3D deflected direction comprises the transverse components and a z component of magnitude 1
					// and the same sign as d.z
					d = vec3(d1.xy - pixy/f, d1.z);
				} else {
					// lens hologram
					// normalise d
					vec3 dN = d/length(d);
					// transverse components of the outgoing light-ray direction
					vec2 dxy = dN.xy - pixy/f;
	
					// from the transverse direction, construct a 3D vector by setting the z component such that the length
					// of the vector is 1
					d = vec3(dxy, sign(d.z)*sqrt(1.0 - dot(dxy, dxy)));
				}
			}

			// Pass the current ray (start point p, direction d, brightness factor b) through (or around) a lens.
			// The (ideal thin) lens, of focal length f, is in a z plane through centreOfLens.
			// It is circular, with the given radius, centred on centreOfLenss.
			void passThroughLens(
				inout vec3 p, 
				inout vec3 d, 
				inout vec4 b,
				vec3 centreOfLens, 
				float radius,
				float focalLength,
				bool idealLens
			) {
				bool isForward;
				propagateForwardToZPlane(p, d, centreOfLens.z, isForward);

				if(isForward) {
					// there is an intersection with the plane of this lens in the ray's forward direction

					// does the intersection point lie within the radius?
					vec2 pixy = p.xy - centreOfLens.xy;
					float r2 = dot(pixy, pixy);
					if(r2 < radius*radius) {
						// the intersection point lies inside the radius, so the lens does something to the ray

						// deflect the light-ray direction accordingly and make sure that the sign of the z component remains the same
						lensDeflect(d, pixy, focalLength, idealLens);

						// lower the brightness factor, giving the light a blue tinge
						b *= vec4(0.9, 0.9, 0.99, 1);
					} 
				}
			}

			// Calculate the distance r from the centre of the logarithmic or archimedean spiral with r = a Exp(b (phi + n*2*pi)) or r = a + b (phi + n*2*pi) respectively.
			// Note that the values of phi are restricted to the range [0, 2 pi].
			float calculateSpiralDistanceFromCentre(float phi, float n, float deltaPhi)
			{
				float c = phi + deltaPhi+n*2.0*PI;
				switch(cylindricalLensSpiralType)
				{
				case 1:	// ARCHIMEDEAN
					return b*c;
				case 2:	// HYPERBOLIC
					return b/c;
				case 0:	// LOGARITHMIC
				default:
					return exp(b*c);			
				}
			}
		
			// calculate the number of the winding that corresponds to position (r, phi)
			float calculateN(float r, float phi, float deltaPhi)
			{
				float phiPlus = phi+deltaPhi;
				
				switch(cylindricalLensSpiralType)
				{
				case 1:	// ARCHIMEDEAN
					return ceil(-((b*phiPlus - r)/b2pi) - 0.5);
				case 2:	// HYPERBOLIC
					float twoPi = 2.0*PI;
					float r2Pi = r*twoPi;
					float twoPi2 = twoPi*twoPi;
					float fl = floor((b-phiPlus*r)/r2Pi);
					return ceil(
						(b-phiPlus*r)/r2Pi
						+(phiPlus+twoPi*fl)/twoPi
						-sqrt(
								phiPlus*phiPlus
								+phiPlus*twoPi
								+4.0*phiPlus*PI*fl
								+twoPi*twoPi*(fl+fl*fl)
						) / twoPi
					);
					// this becomes imaginary if b is <7ish
				case 0:	// LOGARITHMIC
				default:
					return ceil(-((b*phiPlus - log(r))/b2pi) - nHalf);
				}
			}

			float calculateXDerivative(float x, float y, float r, float r2, float phi, float n, float f1, float deltaPhi)
			{	
				float r_n = calculateSpiralDistanceFromCentre(phi, n, deltaPhi);
				float phiPlus = phi+deltaPhi;
		
				// calculated in Mathematica
				switch(cylindricalLensSpiralType)
				{
				case 1:	// ARCHIMEDEAN
					//In the Archimedean case the focal length fArch is given by the ratio of the focal length at radius 1 and the radius
					// hence fArch is given by the focalLength divided by the radius at any given point. 
					if(alvarezWindingFocusing){
						return (r_n-r)*(2.0*r*r*x+b*(r_n+r)*y)/(2.0*f1*r2);
					}
					else
					{
						return -(((x/r)+b*y/r2)*(r-r_n))/(f1/r_n);
					}
				case 2:	// HYPERBOLIC
					return ((y*(r-r_n)*(r-r_n)/(2.0*r2))-(phiPlus+2.0*n*PI)*(r-r_n)*((x/r)-((y*r_n*r_n)/(b*r2))))/f1;
				case 0:	// LOGARITHMIC
				default:
					//In the logarithmic case the focal length, fLog, is constant and hence simply the focalLength.
					if(alvarezWindingFocusing){
						return (-r*r2*(3.0*x+b*y)+3.0*r*r_n*r_n*(x-b*y)+4.0*b*y*r_n*r_n*r_n)/(6.0*r_n*f1*r2);
					}
					else
					{
						return -(((b*exp(b*(phi+n*2.0*PI))*y)/r2 + x/r) * (-exp(b*(phiPlus+n*2.0*PI)) + r))/f1;
					}
				}
			}
		
			float calculateYDerivative(float x, float y, float r, float r2, float phi, float n, float f1, float deltaPhi)
			{
				float r_n = calculateSpiralDistanceFromCentre(phi, n, deltaPhi);
				float phiPlus = phi+deltaPhi;
		
				// calculated in Mathematica
				switch(cylindricalLensSpiralType)
				{
				case 1:	// ARCHIMEDEAN
					//In the Archimedean case the focal length fArch is given by the ratio of the focal length at radius 1 and the radius
					// hence fArch is given by the focalLength divided by the radius at any given point. 
					if(alvarezWindingFocusing){
						return 
								(r_n-r)*(2.0*r*r*y-b*(r_n+r)*x)/(2.0*f1*r2);
					}else {
						return -(((y/r)-b*x/r2)*(r-r_n))/(f1/r_n);
					}
				case 2:	// HYPERBOLIC
					return -((x*(r-r_n)*(r-r_n)/(2.0*r2))+(phiPlus+2.0*n*PI)*(r-r_n)*((y/r)+((x*r_n*r_n)/(b*r2))))/f1;
				case 0:	// LOGARITHMIC
				default:
					//In the logarithmic case the focal length, fLog, is constant and hence simply the focalLength.
					if(alvarezWindingFocusing){
						return (r*r2*(b*x-3.0*y)+3.0*r*r_n*r_n*(b*x+y)-4.0*b*x*r_n*r_n*r_n)/(6.0*f1*r2*r_n);
					}else {
						return -(((-b*exp(b*(phiPlus+n*2.0*PI))*x)/r2 + y/r) * (-exp(b*(phiPlus+n*2.0*PI)) + r))/f1;
					}
				}
			}
			
				

			// Pass the current ray (start point p, direction d, brightness factor b) through a spiral lens.
			// z0 is the z coordinate of the plane of the spiral lens;
			// phi is the angle (in radians) by which the component is rotated around the z axis
			void passThroughSpiralLens(
				inout vec3 p, 
				inout vec3 d, 
				inout vec4 b,
				float z0,
				float deltaPhi,
				float f1
			) {
				bool isForward;
				propagateForwardToZPlane(p, d, z0, isForward);

				if(isForward) {
					// there is an intersection with the plane of this component in the ray's forward direction

					// does the intersection point lie within the radius?
					vec2 pixy = p.xy;
					float r2 = dot(pixy, pixy);
					if(r2 < radius*radius) {
						// the intersection point lies inside the radius, so the lens does something to the ray

						// calculate r and phi
						float r = sqrt(r2);
						float phi = atan(p.y, p.x);

						float n = calculateN(r, phi, deltaPhi);
						float xDerivative = calculateXDerivative(p.x, p.y, r, r2, phi, n, f1, deltaPhi);
						float yDerivative = calculateYDerivative(p.x, p.y, r, r2, phi, n, f1, deltaPhi);


						// normalise d
						vec3 dN = d/length(d);
						// transverse components of the outgoing light-ray direction
						vec2 dxy = dN.xy + vec2(xDerivative, yDerivative);
		
						// from the transverse direction, construct a 3D vector by setting the z component such that the length
						// of the vector is 1
						d = vec3(dxy, sign(d.z)*sqrt(1.0 - dot(dxy, dxy)));						
										

						// deflect the light-ray direction accordingly and make sure that the sign of the z component remains the same
						// lensDeflect(d, pixy, 1.0);

						// lower the brightness factor, giving the light a blue tinge
						b *= vec4(0.9, 0.9, 0.99, 1);
					} 
				}
			}

			// propagate the ray to the plane of the video feed, which is a z-distance <videoDistance> away,
			// and return either the color of the corresponding video-feed texel or the background color
			vec4 getColorOfVideoFeed(
				inout vec3 p, 
				vec3 d, 
				vec4 b,
				float videoFeedZ,
				sampler2D videoFeedTexture,
				float halfWidth,
				float halfHeight,
				vec4 backgroundColor
			) {
				bool isForward;
				propagateForwardToZPlane(p, d, videoFeedZ, isForward);

				// is the intersection in the ray's forward direction?
				if(isForward) {
					// does the ray intersect the image?
					if((abs(p.x) < halfWidth) && (abs(p.y) < halfHeight))
						// yes, the ray intersects the image; take the pixel colour from the camera's video feed
						return texture2D(videoFeedTexture, vec2(0.5+0.5*p.x/halfWidth, 0.5+0.5*p.y/halfHeight));
					else 
						// the ray doesn't intersect the image
						return backgroundColor;
				}
			}

			void main() {
				// first calculate the point this pixel is focussed on
				vec3 dF = intersectionPoint - cameraPosition;
				vec3 focusPosition = cameraPosition + focusDistance/abs(dF.z)*dF;

				// trace <noOfRays> rays
				gl_FragColor = vec4(0, 0, 0, 0);
				vec4 color;
				for(int i=0; i<noOfRays; i++) {
					// the current ray start position, a random point on the camera's circular aperture
					vec3 p = cameraPosition + apertureRadius*randomNumbersX[i]*apertureXHat + apertureRadius*randomNumbersY[i]*apertureYHat;
	
					// first calculate the current light-ray direction:
					// the ray first passes through focusPosition and then p,
					// so the "backwards" ray direction from the camera to the intersection point is
					//   d = focusPosition - p
					vec3 d = focusPosition - p;
					d = dF.z/d.z*d;
	
					// current brightness factor; this will multiply the colour at the end
					vec4 b = vec4(1.0, 1.0, 1.0, 1.0);
	
					if(d.z < 0.0) {
						// the ray is travelling "forwards", in the (-z) direction;
						// pass first through component 1, then component 2, then to environment-facing video feed
						if(visible1) passThroughSpiralLens(p, d, b, z1, phi1,  f1);
						if(visible2) passThroughSpiralLens(p, d, b, z2, phi2, -f1);
						color = getColorOfVideoFeed(p, d, b, -videoDistance, videoFeedETexture, halfWidthE, halfHeightE, vec4(1, 1, 1, 1.0));	// white
					} else {
						// the ray is travelling "backwards", in the (+z) direction;
						// pass first through component 2, then component 1, then to user-facing video feed
						if(visible2) passThroughSpiralLens(p, d, b, z2, phi2, -f1);
						if(visible1) passThroughSpiralLens(p, d, b, z1, phi1,  f1);
						color = getColorOfVideoFeed(p, d, b, videoDistance, videoFeedUTexture, halfWidthU, halfHeightU, vec4(1, 0, 0, 1.0));	// white
					}
		
					// finally, multiply by the brightness factor and add to gl_FragColor
					gl_FragColor += b*color;
				}
					
				gl_FragColor /= float(noOfRays);
			}
		`
	});
	raytracingSphere = new THREE.Mesh( geometry, raytracingSphereShaderMaterial ); 
	scene.add( raytracingSphere );
}

function addEventListenersEtc() {
	// handle device orientation
	// window.addEventListener("deviceorientation", handleOrientation, true);

	// handle window resize
	window.addEventListener("resize", onWindowResize, false);

	// handle screen-orientation (landscape/portrait) change
	screen.orientation.addEventListener( "change", recreateVideoFeeds );

	// share button functionality
	document.getElementById('takePhotoButton').addEventListener('click', takePhoto);

	// toggle fullscreen button functionality
	document.getElementById('fullscreenButton').addEventListener('click', toggleFullscreen);

	// info button functionality
	document.getElementById('infoButton').addEventListener('click', toggleInfoVisibility);

	// back button functionality
	document.getElementById('backButton').addEventListener('click', showLivePhoto);
	document.getElementById('backButton').style.visibility = "hidden";

	// share button
	document.getElementById('shareButton').addEventListener('click', share);
	document.getElementById('shareButton').style.visibility = "hidden";
	if(!(navigator.share)) document.getElementById('shareButton').src="./shareButtonUnavailable.png";
	// if(!(navigator.share)) document.getElementById('shareButton').style.opacity = 0.3;

	// delete button
	document.getElementById('deleteButton').addEventListener('click', deleteStoredPhoto);
	document.getElementById('deleteButton').style.visibility = "hidden";

	// hide the thumbnail for the moment
	document.getElementById('storedPhotoThumbnail').addEventListener('click', showStoredPhoto);
	document.getElementById('storedPhotoThumbnail').style.visibility = "hidden";
	document.getElementById('storedPhoto').addEventListener('click', showLivePhoto);
	document.getElementById('storedPhoto').style.visibility = "hidden";
	// showingStoredPhoto = false;
}

// see https://github.com/mrdoob/three.js/blob/master/examples/webgl_animation_skinning_additive_blending.html
function createGUI() {
	// const 
	gui = new GUI();
	// gui.hide();

	const params = {
		'Visible 1': raytracingSphereShaderMaterial.uniforms.visible1.value,
		'Visible 2': raytracingSphereShaderMaterial.uniforms.visible2.value,
		'Rotation angle (&deg;)': deltaPhi / Math.PI * 180.,
		'Spiral type': raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value,	// 0 = logarithmic, 1 = Archimedean, 2 = hyperbolic
		'Radius': raytracingSphereShaderMaterial.uniforms.radius.value,	// radius of the Fresnel lens
		'f<sub>1</sub>': raytracingSphereShaderMaterial.uniforms.f1.value,	// focal length of cylindrical lens 1 (for Arch. spiral at r=1, for hyp. spiral at phi=1)
		'&Delta;<i>z</i>': deltaZ,
		'<i>b</i>': raytracingSphereShaderMaterial.uniforms.b.value,	// winding parameter of the spiral
		'Alvarez winding focussing': raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value,
		'Horiz. FOV (&deg;)': fovScreen,
		'Aperture radius': apertureRadius,
		'tan<sup>-1</sup>(focus. dist.)': Math.atan(focusDistance),
		'No of rays': noOfRays,
		'Env.-facing cam. (&deg;)': fovVideoFeedE,
		'User-facing cam. (&deg;)': fovVideoFeedU,
		'tan<sup>-1</sup>(video dist.)': Math.atan(raytracingSphereShaderMaterial.uniforms.videoDistance.value),
		'Point (virtual) cam. forward (in -<b>z</b> direction)': pointForward,
		'Show/hide info': toggleInfoVisibility,
		'Restart video streams': function() { 
			recreateVideoFeeds(); 
			postStatus("Restarting video stream");
		}
	}

	gui.add( params, 'Visible 1').onChange( (v) => { raytracingSphereShaderMaterial.uniforms.visible1.value = v; } );
	gui.add( params, 'Visible 2').onChange( (v) => { raytracingSphereShaderMaterial.uniforms.visible2.value = v; } );
	gui.add( params, 'Rotation angle (&deg;)', -90, 90 ).onChange( (a) => { deltaPhi = a/180.0*Math.PI; } );
	gui.add( params, 'Spiral type', { 'Logarithmic': 0, 'Archimedean': 1, 'Hyperbolic': 2 } ).onChange( (s) => { raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value = s; });
	gui.add( params, 'f<sub>1</sub>', -1, 1).onChange( (f1) => { raytracingSphereShaderMaterial.uniforms.f1.value = f1; } );
	gui.add( params, '&Delta;<i>z</i>', 0.000001, 0.1).onChange( (dz) => { deltaZ = dz; } );
	gui.add( params, '<i>b</i>', 0.001, 0.1).onChange( (b) => {raytracingSphereShaderMaterial.uniforms.b.value = b; } );
	gui.add( params, 'Alvarez winding focussing' ).onChange( (a) => { raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value = a; } );

	const folderDevice = gui.addFolder( 'Device cameras horiz. FOV' );
	folderDevice.add( params, 'Env.-facing cam. (&deg;)', 10, 170, 1).onChange( (fov) => { fovVideoFeedE = fov; });   
	folderDevice.add( params, 'User-facing cam. (&deg;)', 10, 170, 1).onChange( (fov) => { fovVideoFeedU = fov; });   
	folderDevice.close();

	const folderVirtualCamera = gui.addFolder( 'Virtual camera' );
	folderVirtualCamera.add( params, 'Horiz. FOV (&deg;)', 10, 170, 1).onChange( setScreenFOV );
	folderVirtualCamera.add( params, 'Aperture radius', 0.0, 1.0).onChange( (r) => { apertureRadius = r; } );
	folderVirtualCamera.add( params, 'tan<sup>-1</sup>(focus. dist.)', 
		//Math.atan(0.1), 
		-0.5*Math.PI,
		0.5*Math.PI
	).onChange( (a) => { focusDistance = Math.tan(a); } );
	folderVirtualCamera.add( params, 'No of rays', 1, 100, 1).onChange( (n) => { noOfRays = n; } );

	const folderSettings = gui.addFolder( 'Other controls' );
	folderSettings.add( params, 'tan<sup>-1</sup>(video dist.)', Math.atan(0.1), 0.5*Math.PI).onChange( (a) => { raytracingSphereShaderMaterial.uniforms.videoDistance.value = Math.tan(a); } );
	folderSettings.add( params, 'Lenslet type', { 'Ideal thin': true, 'Phase hologram': false } ).onChange( (t) => { raytracingSphereShaderMaterial.uniforms.idealLenses.value = t; });
	// folderSettings.add( params, 'Ideal lenses').onChange( (b) => { raytracingSphereShaderMaterial.uniforms.idealLenses.value = b; } );
	folderSettings.add( params, 'Point (virtual) cam. forward (in -<b>z</b> direction)');
	folderSettings.add( params, 'Show/hide info');
	folderSettings.add( params, 'Restart video streams');
	folderSettings.close();
}

/**
 * @param {*} fov	The larger of the camera's horizontal and vertical FOV, in degrees
 * 
 * Set the larger FOV of the screen/window to fov.
 * 
 * Depending on the screen/window's FOV, fov is either the horizontal fov (if screen width > screen height)
 * or the vertical fov (if screen width < screen height).
 */
function setScreenFOV(fov) {
	fovScreen = fov;

	screenChanged();
}

/** 
 * Reset the aspect ratio and FOV of the virtual cameras.
 * 
 * Call if the window size has changed (which also happens when the screen orientation changes)
 * or if camera's FOV has changed
 */
function screenChanged() {
	// alert(`new window size ${window.innerWidth} x ${window.innerHeight}`);

	// in case the screen size has changed
	if(renderer) renderer.setSize(window.innerWidth, window.innerHeight);

	// if the screen orientation changes, width and height swap places, so the aspect ratio changes
	let windowAspectRatio = window.innerWidth / window.innerHeight;
	camera.aspect = windowAspectRatio;

	// fovS is the screen's horizontal or vertical FOV, whichever is greater;
	// re-calculate the camera FOV, which is the *vertical* fov
	let verticalFOV;
	if(windowAspectRatio > 1.0) {
		// fovS is horizontal FOV; convert to get correct vertical FOV
		verticalFOV = 2.0*Math.atan(Math.tan(0.5*fovScreen*Math.PI/180.0)/windowAspectRatio)*180.0/Math.PI;
	} else {
		// fovS is already vertical FOV
		verticalFOV = fovScreen;
	}
	camera.fov = verticalFOV;

	// make sure the camera changes take effect
	camera.updateProjectionMatrix();
}

function  pointForward() {
	let r = camera.position.length();
	camera.position.x = 0;
	camera.position.y = 0;
	camera.position.z = r;
	controls.update();
	postStatus('Pointing camera forwards (in -<b>z</b> direction)');
}

function onWindowResize() {
	screenChanged();
	postStatus(`window size ${window.innerWidth} &times; ${window.innerHeight}`);	// debug
}

// // see https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/change_event
function recreateVideoFeeds() {
	// stop current video streams...
	videoFeedE.srcObject.getTracks().forEach(function(track) { track.stop(); });
	videoFeedU.srcObject.getTracks().forEach(function(track) { track.stop(); });

	// ... and re-create new ones, hopefully of the appropriate size
	createVideoFeeds();
}

function addOrbitControls() {
	// controls

	controls = new OrbitControls( camera, renderer.domElement );
	// controls = new OrbitControls( cameraOutside, renderer.domElement );
	controls.listenToKeyEvents( window ); // optional

	//controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)
	controls.addEventListener( 'change', cameraPositionChanged );

	controls.enableDamping = false; // an animation loop is required when either damping or auto-rotation are enabled
	controls.dampingFactor = 0.05;

	controls.enablePan = true;
	controls.enableZoom = true;

	controls.maxPolarAngle = Math.PI;
}

function cameraPositionChanged() {
	postStatus(`Camera position (${camera.position.x.toPrecision(2)}, ${camera.position.y.toPrecision(2)}, ${camera.position.z.toPrecision(2)})`);
	// counter = 0;
	// keep the raytracing sphere centred on the camera position
	// raytracingSphere.position.copy(camera.position.clone());	// TODO this doesn't seem to work as intended!?
}

async function toggleFullscreen() {
	if (!document.fullscreenElement) {
		document.documentElement.requestFullscreen().catch((err) => {
			postStatus(
				`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`,
			);
		});
		// allow screen orientation changes
		// screen.orientation.unlock();
	} else {
		document.exitFullscreen();
	}
}

function showStoredPhoto() {
	gui.hide();
	renderer.domElement.style.visibility = "hidden";
	document.getElementById('takePhotoButton').style.visibility = "hidden";
	// document.getElementById('changePositionButton').style.visibility = "hidden";
	document.getElementById('storedPhotoThumbnail').style.visibility = "hidden";
	document.getElementById('backButton').style.visibility = "visible";
	document.getElementById('shareButton').style.visibility = "visible";
	document.getElementById('deleteButton').style.visibility = "visible";
	document.getElementById('storedPhoto').style.visibility = "visible";
	showingStoredPhoto = true;

	postStatus('Showing stored photo, '+storedPhotoDescription);
}

function showLivePhoto() {
	gui.show();
	renderer.domElement.style.visibility = "visible";
	document.getElementById('takePhotoButton').style.visibility = "visible";
	// document.getElementById('changePositionButton').style.visibility = "visible";
	if(storedPhoto) document.getElementById('storedPhotoThumbnail').style.visibility = "visible";
	document.getElementById('backButton').style.visibility = "hidden";
	document.getElementById('shareButton').style.visibility = "hidden";
	document.getElementById('deleteButton').style.visibility = "hidden";
	document.getElementById('storedPhoto').style.visibility = "hidden";
	showingStoredPhoto = false;

	postStatus('Showing live image');
}

function deleteStoredPhoto() {
	storedPhoto = null;

	showLivePhoto();

	postStatus('Stored photo deleted; showing live image');
}

function takePhoto() {
	try {
		click.play();

		storedPhoto = renderer.domElement.toDataURL('image/png');
		storedPhotoInfoString = getInfoString();

		storedPhotoDescription = name;
		// 
		document.getElementById('storedPhoto').src=storedPhoto;
		document.getElementById('storedPhotoThumbnail').src=storedPhoto;
		document.getElementById('storedPhotoThumbnail').style.visibility = "visible";
	
		postStatus('Photo taken; click thumbnail to view and share');
	} catch (error) {
		console.error('Error:', error);
	}	
}

async function share() {
	try {
		fetch(storedPhoto)
		.then(response => response.blob())
		.then(blob => {
			const file = new File([blob], name+storedPhotoDescription+'.png', { type: blob.type });

			// Use the Web Share API to share the screenshot
			if (navigator.share) {
				navigator.share({
					title: storedPhotoDescription,
					files: [file],
				});
			} else {
				postStatus('Sharing is not supported by this browser.');
			}	
		})
		.catch(error => {
			console.error('Error:', error);
			postStatus(`Error: ${error}`);
		});
	} catch (error) {
		console.error('Error:', error);
	}
}

/** 
 * Add a text field to the bottom left corner of the screen
 */
function createStatus() {
	// see https://stackoverflow.com/questions/15248872/dynamically-create-2d-text-in-three-js
	status.style.position = 'absolute';
	status.style.backgroundColor = "rgba(0, 0, 0, 0.3)";	// semi-transparent black
	status.style.color = "White";
	status.style.fontFamily = "Arial";
	status.style.fontSize = "9pt";
	postStatus("Welcome!");
	status.style.bottom = 0 + 'px';
	status.style.left = 0 + 'px';
	status.style.zIndex = 1;
	document.body.appendChild(status);	
}

function postStatus(text) {
	status.innerHTML = '&nbsp;'+text;
	console.log('status: '+text);

	// show the text only for 3 seconds
	statusTime = new Date().getTime();
	setTimeout( () => { if(new Date().getTime() - statusTime > 2999) status.innerHTML = '&nbsp;'+name+', University of Glasgow, <a href="https://github.com/jkcuk/'+name+'">https://github.com/jkcuk/'+name+'</a>' }, 3000);
}

function getInfoString() {
	return `<br>` +
		`&nbsp;&nbsp;Visible 1`+ (raytracingSphereShaderMaterial.uniforms.visible1.value?'&check;':'&cross;')+`<br>` +
		`&nbsp;&nbsp;Visible 2`+ (raytracingSphereShaderMaterial.uniforms.visible2.value?'&check;':'&cross;')+`<br>` +
		`&nbsp;&nbsp;Rotation angle = ${deltaPhi.toPrecision(4)}&deg;<br>` +
		// 'Lenslet type: '+(raytracingSphereShaderMaterial.uniforms.idealLenses.value?'Ideal thin lenses':'Phase holograms') + "<br>" +
		`Video feeds<br>` +
		`&nbsp;&nbsp;Distance from origin = ${raytracingSphereShaderMaterial.uniforms.videoDistance.value.toPrecision(4)}<br>` +	// (user-facing) camera
		`&nbsp;&nbsp;Horizontal fields of view (when seen from the origin)<br>` +
		`&nbsp;&nbsp;&nbsp;&nbsp;User-facing camera = ${fovVideoFeedU.toPrecision(4)}&deg;<br>` +	// (user-facing) camera
		`&nbsp;&nbsp;&nbsp;&nbsp;Environment-facing camera = ${fovVideoFeedE.toPrecision(4)}&deg;<br>` +	// (environment-facing) camera
		`Virtual camera<br>` +
		`&nbsp;&nbsp;Position = (${camera.position.x.toPrecision(4)}, ${camera.position.y.toPrecision(4)}, ${camera.position.z.toPrecision(4)})<br>` +
		`&nbsp;&nbsp;Horiz. FOV = ${fovScreen.toPrecision(4)}<br>` +
		`&nbsp;&nbsp;Aperture radius = ${apertureRadius.toPrecision(4)}<br>` +
		`&nbsp;&nbsp;Focussing distance = ${focusDistance.toPrecision(4)}<br>` +
		`&nbsp;&nbsp;Number of rays = ${noOfRays}`
		// `apertureXHat = (${raytracingSphereShaderMaterial.uniforms.apertureXHat.value.x.toPrecision(4)}, ${raytracingSphereShaderMaterial.uniforms.apertureXHat.value.y.toPrecision(4)}, ${raytracingSphereShaderMaterial.uniforms.apertureXHat.value.z.toPrecision(4)})<br>` +
		// `apertureYHat = (${raytracingSphereShaderMaterial.uniforms.apertureYHat.value.x.toPrecision(4)}, ${raytracingSphereShaderMaterial.uniforms.apertureYHat.value.y.toPrecision(4)}, ${raytracingSphereShaderMaterial.uniforms.apertureYHat.value.z.toPrecision(4)})`
		;
		console.log("*");
}

function refreshInfo() {
	if(showingStoredPhoto) setInfo( storedPhotoInfoString );
	else setInfo( getInfoString() );

	if(info.style.visibility == "visible") setTimeout( refreshInfo , 100);	// refresh again a while
}

/** 
 * Add a text field to the top left corner of the screen
 */
function createInfo() {
	// see https://stackoverflow.com/questions/15248872/dynamically-create-2d-text-in-three-js
	info.style.position = 'absolute';
	info.style.backgroundColor = "rgba(0, 0, 0, 0.3)";	// semi-transparent black
	info.style.color = "White";
	info.style.fontFamily = "Arial";
	info.style.fontSize = "9pt";
	info.innerHTML = "-- nothing to show (yet) --";
	info.style.top = 60 + 'px';
	info.style.left = 0 + 'px';
	info.style.zIndex = 1;
	document.body.appendChild(info);
	info.style.visibility = "hidden";
}

function setInfo(text) {
	info.innerHTML = text;
	console.log('info: '+text);
}

function toggleInfoVisibility() {
	switch(info.style.visibility) {
		case "visible":
			info.style.visibility = "hidden";
			break;
		case "hidden":
		default:
			info.style.visibility = "visible";
			refreshInfo();
	}
}