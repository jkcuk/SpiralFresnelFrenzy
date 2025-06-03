
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
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

let appName = 'SpiralFresnelFrenzy';
let appDescription = 'the premier AR tool for simulating adaptive spiral Fresnel lenses';

let qAFL = 1/(100*Math.PI/180.0);	// the ratio of focal power and the angle between the two components (in radians)
let deltaTheta = 10.0*Math.PI/180.0;	// angle by which components are rotated relative to each other (in radians)
let deltaZ = 0.00001;
let deltaZMin = 0.00001;
let yXR = 1.5;
let show = 0;	// 0 = both parts, 1 = part 1, 2 = part 2, 3 = equivalent lens, 4 = None
let windingFocussing = 1;	// 0 = None, 1 = Alvarez, 2 = separation (works for log. spiral only!)
let azimuthalPhaseCorrection = 1;	// 0 = Off, 1 = On

let scene;
let aspectRatioVideoFeedU = 4.0/3.0;
let aspectRatioVideoFeedE = 4.0/3.0;
let renderer;
let videoFeedU, videoFeedE;	// feeds from user/environment-facing cameras
let videoFeedUTexture, videoFeedETexture;
let textureTIM, textureEarthrise, textureAldrin, texturePillars, textureLunch, textureHalfDome, textureBlueMarble;
let aspectRatioTIM, aspectRatioEarthrise, aspectRatioAldrin, aspectRatioPillars, aspectRatioLunch, aspectRatioHalfDome, aspectRatioBlueMarble;
let backgroundColourTIM, backgroundColourEarthrise, backgroundColourAldrin, backgroundColourPillars, backgroundColourLunch, backgroundColourHalfDome, backgroundColourBlueMarble;
let camera;
let controls;
let raytracingSphere;
let raytracingSphereShaderMaterial;

// the background image
let background = 0;
let fovBackground = 68;
	
// Nokia HR20, according to https://www.camerafv5.com/devices/manufacturers/hmd_global/nokia_xr20_ttg_0/
let fovVideoFeedU = 67.3;	// (user-facing) camera
let fovVideoFeedE = 68.3;	// (environment-facing) camera
let fovScreen = 68;

let cameraLensDistance = 3.0;
let raytracingSphereRadius = 20.0;

// camera with wide aperture
let apertureRadius = 0.02;
let atanFocusDistance = Math.atan(3e8);	// 1 light second
let noOfRays = 1;
let autofocus = true;

// the status text area
let status;	// = document.createElement('div');
let statusTime;	// the time the last status was posted

// the info text area
let info;	// = document.createElement('div');

let gui;
let GUIParams;
let showControl, spiralTypeControl, windingFocussingControl, azimuthalPhaseCorrectionControl, deltaZControl, backgroundControl, autofocusControl, focusDistanceControl;
// let folderComponents, folderBackground, folderVirtualCamera;


// let counter = 0;

// true if stored photo is showing
let showingStoredPhoto = false;
let storedPhoto;
let storedPhotoDescription;
let storedPhotoInfoString;

// my Canon EOS450D
const click = new Audio('./click.m4a');

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

	loadBackgroundImages();

	addRaytracingSphere();

	// user interface

	addEventListenersEtc();

	addOrbitControls();

	// the controls menu
	// refreshGUI();
	createGUI();

	// check if VR is supported (see https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/isSessionSupported)...
	if (navigator.xr) {
		navigator.xr.isSessionSupported("immersive-vr").then((isSupported) => {
		  if (isSupported) {
			// ... and enable the relevant features
			renderer.xr.enabled = true;
			// use renderer.xr.isPresenting to find out if we are in XR mode -- see https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager 
			// (and https://threejs.org/docs/#api/en/renderers/WebGLRenderer.xr, which states that renderer.xr points to the WebXRManager)
			document.body.appendChild( VRButton.createButton( renderer ) );	// for VR content
			addXRInteractivity();
		  }
		});
	  }

	createInfo();
	refreshInfo();
}

function animate() {

	renderer.setAnimationLoop( render );

}

function render() {
	// requestAnimationFrame( animate );

	// stats.begin();

	if(!showingStoredPhoto) {
		// update uniforms
		updateUniforms();

		renderer.render( scene,  camera );
	}

	// stats.end();
}

// function updateUniforms() {
// 	raytracingSphereShaderMaterial.uniforms.phi1.value = -0.5*deltaTheta;
// 	raytracingSphereShaderMaterial.uniforms.phi2.value = +0.5*deltaTheta;

// 	// arrange them symmetrically around z=0
// 	raytracingSphereShaderMaterial.uniforms.z1.value = +0.5*deltaZ;
// 	raytracingSphereShaderMaterial.uniforms.z2.value = -0.5*deltaZ;

// 	let b2pi = raytracingSphereShaderMaterial.uniforms.b.value*2.0*Math.PI;
// 	raytracingSphereShaderMaterial.uniforms.b2pi.value = b2pi;
// 	raytracingSphereShaderMaterial.uniforms.nHalf.value = Math.log(0.5*(1. + Math.exp(b2pi)))/b2pi;

// 	raytracingSphereShaderMaterial.uniforms.equivalentLensF.value = calculateEquivalentLensF();


// 	// the tangents for the environment-facing camera video feed
// 	let tanHalfFovHE, tanHalfFovVE;
// 	if(aspectRatioVideoFeedE > 1.0) {
// 		// horizontal orientation
// 		tanHalfFovHE = Math.tan(0.5*fovVideoFeedE*Math.PI/180.0);
// 		tanHalfFovVE = Math.tan(0.5*fovVideoFeedE*Math.PI/180.0)/aspectRatioVideoFeedE;
// 	} else {
// 		// vertical orientation
// 		tanHalfFovHE = Math.tan(0.5*fovVideoFeedE*Math.PI/180.0)*aspectRatioVideoFeedE;
// 		tanHalfFovVE = Math.tan(0.5*fovVideoFeedE*Math.PI/180.0);
// 	}
// 	raytracingSphereShaderMaterial.uniforms.halfWidthE.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovHE;
// 	raytracingSphereShaderMaterial.uniforms.halfHeightE.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovVE;

// 	// the tangents for the user-facing camera video feed
// 	let tanHalfFovHU, tanHalfFovVU;
// 	if(aspectRatioVideoFeedU > 1.0) {
// 		// horizontal orientation
// 		tanHalfFovHU = Math.tan(0.5*fovVideoFeedU*Math.PI/180.0);
// 		tanHalfFovVU = Math.tan(0.5*fovVideoFeedU*Math.PI/180.0)/aspectRatioVideoFeedU;
// 	} else {
// 		// vertical orientation
// 		tanHalfFovHU = Math.tan(0.5*fovVideoFeedU*Math.PI/180.0)*aspectRatioVideoFeedU;
// 		tanHalfFovVU = Math.tan(0.5*fovVideoFeedU*Math.PI/180.0);
// 	}
// 	raytracingSphereShaderMaterial.uniforms.halfWidthU.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovHU;
// 	raytracingSphereShaderMaterial.uniforms.halfHeightU.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovVU;

// 	// create the points on the aperture

// 	// create basis vectors for the camera's clear aperture
// 	let viewDirection = new THREE.Vector3();
// 	let apertureBasisVector1 = new THREE.Vector3();
// 	let apertureBasisVector2 = new THREE.Vector3();
// 	camera.getWorldDirection(viewDirection);
// 	// if(counter < 10) console.log(`viewDirection = (${viewDirection.x.toPrecision(2)}, ${viewDirection.y.toPrecision(2)}, ${viewDirection.z.toPrecision(2)})`);

// 	if((viewDirection.x == 0.0) && (viewDirection.y == 0.0)) {
// 		// viewDirection is along z direction
// 		apertureBasisVector1.crossVectors(viewDirection, new THREE.Vector3(1, 0, 0)).normalize();
// 	} else {
// 		// viewDirection is not along z direction
// 		apertureBasisVector1.crossVectors(viewDirection, new THREE.Vector3(0, 0, 1)).normalize();
// 	}
// 	// viewDirection = new THREE.Vector3(0, 0, -1);
// 	// apertureBasisVector1 = new THREE.Vector3(1, 0, 0);
// 	apertureBasisVector2.crossVectors(viewDirection, apertureBasisVector1).normalize();

// 	// apertureBasis1 *= apertureRadius;
// 	// apertureBasis2 *= apertureRadius;

// 	// if(counter < 10) console.log(`apertureBasisVector1 = (${apertureBasisVector1.x.toPrecision(2)}, ${apertureBasisVector1.y.toPrecision(2)}, ${apertureBasisVector1.z.toPrecision(2)})`);
// 	// if(counter < 10) console.log(`apertureBasisVector2 = (${apertureBasisVector2.x.toPrecision(2)}, ${apertureBasisVector2.y.toPrecision(2)}, ${apertureBasisVector2.z.toPrecision(2)})`);
// 	// counter++;

// 	// create random points on the (circular) aperture
// 	// let i=0;
// 	// pointsOnAperture = [];	// clear the array containing points on the aperture
// 	// do {
// 	// 	// create a new random point on the camera's clear aperture
// 	// 	let x = 2*Math.random()-1;	// random number between -1 and 1
// 	// 	let y = 2*Math.random()-1;	// random number between -1 and 1
// 	// 	if(x*x + y*y <= 1) {
// 	// 		// (x,y) lies within a circle of radius 1
// 	// 		//  add a new point to the array of points on the aperture
// 	// 		pointsOnAperture.push(apertureRadius*x*apertureBasis1 + apertureRadius*y*apertureBasis2);
// 	// 		i++;
// 	// 	}
// 	// } while (i < noOfRays);
// 	raytracingSphereShaderMaterial.uniforms.noOfRays.value = noOfRays;
// 	raytracingSphereShaderMaterial.uniforms.apertureXHat.value.copy(apertureBasisVector1);
// 	raytracingSphereShaderMaterial.uniforms.apertureYHat.value.copy(apertureBasisVector2);
// 	// raytracingSphereShaderMaterial.uniforms.apertureXHat.value.x = apertureRadius*apertureBasisVector1.x;
// 	// raytracingSphereShaderMaterial.uniforms.apertureXHat.value.y = apertureRadius*apertureBasisVector1.y;
// 	// raytracingSphereShaderMaterial.uniforms.apertureXHat.value.z = apertureRadius*apertureBasisVector1.z;
// 	// raytracingSphereShaderMaterial.uniforms.apertureYHat.value.x = apertureRadius*apertureBasisVector2.x;
// 	// raytracingSphereShaderMaterial.uniforms.apertureYHat.value.y = apertureRadius*apertureBasisVector2.y;
// 	// raytracingSphereShaderMaterial.uniforms.apertureYHat.value.z = apertureRadius*apertureBasisVector2.z;
// 	// raytracingSphereShaderMaterial.uniforms.pointsOnAperture.value = pointsOnAperture;
// 	raytracingSphereShaderMaterial.uniforms.apertureRadius.value = apertureRadius;
// 	raytracingSphereShaderMaterial.uniforms.focusDistance.value = focusDistance;

// 	// (re)create random numbers
// 	// let i=0;
// 	// let randomNumbersX = [];
// 	// let randomNumbersY = [];
// 	// do {
// 	// 	// create a new pairs or random numbers (x, y) such that x^2 + y^2 <= 1
// 	// 	let x = 2*Math.random()-1;	// random number between -1 and 1
// 	// 	let y = 2*Math.random()-1;	// random number between -1 and 1
// 	// 	if(x*x + y*y <= 1) {
// 	// 		// (x,y) lies within a circle of radius 1
// 	// 		//  add a new point to the array of points on the aperture
// 	// 		randomNumbersX.push(apertureRadius*x);
// 	// 		randomNumbersY.push(apertureRadius*y);
// 	// 		i++;
// 	// 	}
// 	// } while (i < 100);
// 	// raytracingSphereShaderMaterial.uniforms.randomNumbersX.value = randomNumbersX;
// 	// raytracingSphereShaderMaterial.uniforms.randomNumbersY.value = randomNumbersY;
// }

function updateUniforms() {
	let f1 = raytracingSphereShaderMaterial.uniforms.b.value/qAFL;
	raytracingSphereShaderMaterial.uniforms.f1.value = f1;

	switch(show) {
	case 1:	// part 1
		raytracingSphereShaderMaterial.uniforms.visible1.value = true;
		raytracingSphereShaderMaterial.uniforms.visible2.value = false;
		raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value = false;
		break;
	case 2:	// part 2
		raytracingSphereShaderMaterial.uniforms.visible1.value = false;
		raytracingSphereShaderMaterial.uniforms.visible2.value = true;
		raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value = false;
		break;
	case 3:	// equivalent lens
		raytracingSphereShaderMaterial.uniforms.visible1.value = false;
		raytracingSphereShaderMaterial.uniforms.visible2.value = false;
		raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value = true;
		break;
	case 4:	// none
		raytracingSphereShaderMaterial.uniforms.visible1.value = false;
		raytracingSphereShaderMaterial.uniforms.visible2.value = false;
		raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value = false;
		break;
	case 0:	// both parts
	default:
		raytracingSphereShaderMaterial.uniforms.visible1.value = true;
		raytracingSphereShaderMaterial.uniforms.visible2.value = true;
		raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value = false;
	}

	switch(windingFocussing) {
	case 0:	// None
		raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value = false;
		break;
	case 2:	// separation
		raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value = false;
		if(raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value === 0) {
			// the spiral type is logarithmic, which is the only type for which separation-based winding focussing works
			if(deltaTheta >= 0) {
				// deltaTheta >= 0, which is the other condition for separation-based winding focussing to work
				deltaZ = f1*f1/calculateEquivalentLensF();
				windingFocussingControl.domElement.style.color = "#FFFFFF";
			} else {
				// deltaTheta < 0; separation-based winding focussing doesn't work here
				deltaZ = deltaZMin;
				windingFocussingControl.domElement.style.color = "#FF0000";
			}
			deltaZControl.setValue(deltaZ);
		} else {
			windingFocussingControl.domElement.style.color = "#FF0000";
		}
		break;		
	case 1:	// Alvarez
	default:
		raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value = true;
	}

	switch(azimuthalPhaseCorrection) {
		case 0:	// Off
			raytracingSphereShaderMaterial.uniforms.azimuthalPhaseCorrection.value = false;
			break;
		case 1:	// On
		default:
			raytracingSphereShaderMaterial.uniforms.azimuthalPhaseCorrection.value = true;		
	}

	raytracingSphereShaderMaterial.uniforms.phi1.value = 0;	// -0.5*deltaTheta;
	raytracingSphereShaderMaterial.uniforms.phi2.value = deltaTheta;	// +0.5*deltaTheta;

	// arrange them symmetrically around z=0
	raytracingSphereShaderMaterial.uniforms.c1.value.z = +0.5*deltaZ;
	raytracingSphereShaderMaterial.uniforms.c2.value.z = -0.5*deltaZ;

	// if we are in vr mode, move the lenses up
	if(renderer.xr.enabled && renderer.xr.isPresenting) {
		raytracingSphereShaderMaterial.uniforms.c1.value.y = yXR;
		raytracingSphereShaderMaterial.uniforms.c2.value.y = yXR;
	}

	let b2pi = raytracingSphereShaderMaterial.uniforms.b.value*2.0*Math.PI;
	raytracingSphereShaderMaterial.uniforms.b2pi.value = b2pi;
	raytracingSphereShaderMaterial.uniforms.nHalf.value = Math.log(0.5*(1. + Math.exp(b2pi)))/b2pi;

	let equivalentLensF = calculateEquivalentLensF();
	raytracingSphereShaderMaterial.uniforms.equivalentLensF.value = equivalentLensF;

	let aspectRatioBackground;
	switch(background) {
	case 0:	// device camera(s)
		raytracingSphereShaderMaterial.uniforms.backgroundTexture.value = videoFeedETexture;
		aspectRatioBackground = aspectRatioVideoFeedE;
		raytracingSphereShaderMaterial.uniforms.backgroundColour.value = new THREE.Vector4(0, 0, 0, 1);	// black
		break;
	case 1:	// TIM	// Earthrise
		raytracingSphereShaderMaterial.uniforms.backgroundTexture.value = textureTIM;	// Earthrise;
		aspectRatioBackground = aspectRatioTIM;	// Earthrise;
		raytracingSphereShaderMaterial.uniforms.backgroundColour.value = backgroundColourTIM;	// Earthrise;
		break;
	case 2:	// Aldrin
		raytracingSphereShaderMaterial.uniforms.backgroundTexture.value = textureAldrin;
		aspectRatioBackground = aspectRatioAldrin;
		raytracingSphereShaderMaterial.uniforms.backgroundColour.value = backgroundColourAldrin;
		break;
	// case 3:	// pillars of creation
	// 	raytracingSphereShaderMaterial.uniforms.backgroundTexture.value = texturePillars;
	// 	aspectRatioBackground = aspectRatioPillars;	
	// 	raytracingSphereShaderMaterial.uniforms.backgroundColour.value = backgroundColourPillars;
	// 	break;
	// case 4:	// lunch atop a skyscraper
	// 	raytracingSphereShaderMaterial.uniforms.backgroundTexture.value = textureLunch;
	// 	aspectRatioBackground = aspectRatioLunch;
	// 	raytracingSphereShaderMaterial.uniforms.backgroundColour.value = backgroundColourLunch;
	// 	break;
	case 3:	// Half Dome
		raytracingSphereShaderMaterial.uniforms.backgroundTexture.value = textureHalfDome;
		aspectRatioBackground = aspectRatioHalfDome;
		raytracingSphereShaderMaterial.uniforms.backgroundColour.value = backgroundColourHalfDome;
	// 	break;
	// case 6:	// Blue marble
	// 	raytracingSphereShaderMaterial.uniforms.backgroundTexture.value = textureBlueMarble;
	// 	aspectRatioBackground = aspectRatioBlueMarble;
	// 	raytracingSphereShaderMaterial.uniforms.backgroundColour.value = backgroundColourBlueMarble;
	}

	// the tangents for the environment-facing camera video feed
	let tanHalfFovHBackground, tanHalfFovVBackground;
	if(aspectRatioBackground > 1.0) {
		// horizontal orientation
		tanHalfFovHBackground = Math.tan(0.5*fovBackground*Math.PI/180.0);
		tanHalfFovVBackground = Math.tan(0.5*fovBackground*Math.PI/180.0)/aspectRatioBackground;
	} else {
		// vertical orientation
		tanHalfFovHBackground = Math.tan(0.5*fovBackground*Math.PI/180.0)*aspectRatioBackground;
		tanHalfFovVBackground = Math.tan(0.5*fovBackground*Math.PI/180.0);
	}
	raytracingSphereShaderMaterial.uniforms.halfWidthBackground.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovHBackground;
	raytracingSphereShaderMaterial.uniforms.halfHeightBackground.value = raytracingSphereShaderMaterial.uniforms.videoDistance.value*tanHalfFovVBackground;


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
	// are we in VR mode?
	if(renderer.xr.enabled && renderer.xr.isPresenting) {
		viewDirection.copy(new THREE.Vector3(0, 0, -1));
	} else {
		camera.getWorldDirection(viewDirection);
		viewDirection.normalize();
	}
	// postStatus(`viewDirection.lengthSq() = ${viewDirection.lengthSq()}`);
	// if(counter < 10) console.log(`viewDirection = (${viewDirection.x.toPrecision(2)}, ${viewDirection.y.toPrecision(2)}, ${viewDirection.z.toPrecision(2)})`);

	if((viewDirection.x == 0.0) && (viewDirection.y == 0.0)) {
		// viewDirection is along z direction
		apertureBasisVector1.crossVectors(viewDirection, new THREE.Vector3(1, 0, 0)).normalize();
	} else {
		// viewDirection is not along z direction
		apertureBasisVector1.crossVectors(viewDirection, new THREE.Vector3(0, 0, 1)).normalize();
	}
	apertureBasisVector1.crossVectors(THREE.Object3D.DEFAULT_UP, viewDirection).normalize();
	// viewDirection = new THREE.Vector3(0, 0, -1);
	// apertureBasisVector1 = new THREE.Vector3(1, 0, 0);
	apertureBasisVector2.crossVectors(viewDirection, apertureBasisVector1).normalize();

	let backgroundCentre = new THREE.Vector3(0, 0, 0);
	// are we in VR mode?
	// if(renderer.xr.enabled && renderer.xr.isPresenting) {
	// backgroundCentre.copy(new THREE.Vector3(0, yXR, -raytracingSphereShaderMaterial.uniforms.videoDistance.value));
	// } else {	
	backgroundCentre.copy(camera.position);
	backgroundCentre.addScaledVector(viewDirection, raytracingSphereShaderMaterial.uniforms.videoDistance.value);
	// }
	// postStatus(`backgroundCentre=(${backgroundCentre.x}, ${backgroundCentre.y}, ${backgroundCentre.z})`);
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
	raytracingSphereShaderMaterial.uniforms.apertureXHat.value.copy(apertureBasisVector1);
	raytracingSphereShaderMaterial.uniforms.apertureYHat.value.copy(apertureBasisVector2);
	raytracingSphereShaderMaterial.uniforms.viewDirection.value.copy(viewDirection);
	raytracingSphereShaderMaterial.uniforms.backgroundCentre.value.copy(backgroundCentre);
	// raytracingSphereShaderMaterial.uniforms.apertureXHat.value.x = apertureRadius*apertureBasisVector1.x;
	// raytracingSphereShaderMaterial.uniforms.apertureXHat.value.y = apertureRadius*apertureBasisVector1.y;
	// raytracingSphereShaderMaterial.uniforms.apertureXHat.value.z = apertureRadius*apertureBasisVector1.z;
	// raytracingSphereShaderMaterial.uniforms.apertureYHat.value.x = apertureRadius*apertureBasisVector2.x;
	// raytracingSphereShaderMaterial.uniforms.apertureYHat.value.y = apertureRadius*apertureBasisVector2.y;
	// raytracingSphereShaderMaterial.uniforms.apertureYHat.value.z = apertureRadius*apertureBasisVector2.z;
	// raytracingSphereShaderMaterial.uniforms.pointsOnAperture.value = pointsOnAperture;
	raytracingSphereShaderMaterial.uniforms.apertureRadius.value = apertureRadius;

	let focusDistance;
	if(autofocus) {
		let sign = Math.sign(viewDirection.z);

		// calculate the "object distance" of the z plane containing the background centre
		let o = sign*backgroundCentre.z;

		// calculate "image distance" of the z plane containing the image of the background centre
		// let i = o*equivalentLensF/(o-equivalentLensF);

		// calculate the magnification of the image of the background centre, which is -(image distance)/(object distance)
		let m;
		if(equivalentLensF === Infinity) m = 1;
		else m = equivalentLensF/(equivalentLensF - o);

		// calculate the image of the background centre, making good use of the fact that the principal point of the lens is at the origin
		let backgroundCentreImage = backgroundCentre.multiplyScalar(m);

		// calculate the focus distance
		let cp2bcPrime = new THREE.Vector3(0, 0, 0);	// the vector from the camera centre to the image of the background centre
		cp2bcPrime.copy(backgroundCentreImage);
		cp2bcPrime.addScaledVector(camera.position, -1);
	
		focusDistance = cp2bcPrime.dot(viewDirection);
		// postStatus(`focusDistance = ${focusDistance}`);
		atanFocusDistance = Math.atan(focusDistance);
	} else {
		focusDistance = Math.tan(atanFocusDistance);
	}
	if(raytracingSphereShaderMaterial.uniforms.focusDistance.value != focusDistance) {
		raytracingSphereShaderMaterial.uniforms.focusDistance.value = focusDistance;
		// GUIParams.'tan<sup>-1</sup>(focus. dist.)'.value = atanFocusDistance;
		focusDistanceControl.setValue(atanFocusDistance);
	}

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

/** create raytracing phere */
function addRaytracingSphere() {
	videoFeedUTexture = new THREE.VideoTexture( videoFeedU );
	videoFeedETexture = new THREE.VideoTexture( videoFeedE );
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
			cylindricalLensSpiralType: { value: 0 },	// 0 = logarithmic, 1 = Archimedean, 2 = hyperbolic r=1/(-b psi)
			radius: { value: 1.0 },	// radius of the Fresnel lens
			visible1: { value: true },
			c1: { value: new THREE.Vector3(0, 0, 0) },	// centre of part 1
			phi1: { value: 0 },	// angle by which component 1 is rotated around the z axis, in radians
			visible2: { value: true },
			c2: { value: new THREE.Vector3(0, 0, 0) },	// centre of part 2
			phi2: { value: 0 },	// angle by which component 2 is rotated around the z axis, in radians
			f1: { value: 0.1 },	// focal length of cylindrical lens at r=1
			b: { value: 0.02 },	// winding parameter of the spiral
			b2pi: { value: 0 },	// b*2 pi; pre-calculated in updateUniforms()
			nHalf: { value: 0 },	// pre-calculated in updateUniforms()
			alvarezWindingFocusing: { value: windingFocussing == 1 },
			azimuthalPhaseCorrection: { value: azimuthalPhaseCorrection == 1 },
			showEquivalentLens: { value: false },
			equivalentLensF: { value: 1e10 },
			videoFeedUTexture: { value: videoFeedUTexture }, 
			videoFeedETexture: { value: videoFeedETexture }, 
			backgroundTexture: { value: textureEarthrise },
			backgroundColour: { value: new THREE.Vector4(0, 0, 0, 1) },
			halfWidthU: { value: 1.0 },
			halfHeightU: { value: 1.0 },
			halfWidthE: { value: 1.0 },
			halfHeightE: { value: 1.0 },
			halfWidthBackground: { value: 1.0 },
			halfHeightBackground: { value: 1.0 },
			videoDistance: { value: 3e8 },	// distance of the image of the video feed from the origin
			focusDistance: { value: 10.0 },
			apertureXHat: { value: new THREE.Vector3(1, 0, 0) },
			apertureYHat: { value: new THREE.Vector3(0, 1, 0) },
			apertureRadius: { value: apertureRadius },
			randomNumbersX: { value: randomNumbersX },
			randomNumbersY: { value: randomNumbersY },
			noOfRays: { value: 1 },
			viewDirection: { value: new THREE.Vector3(0, 0, -1) },
			backgroundCentre: { value: new THREE.Vector3(0, 0, -1) },
			keepVideoFeedForward: { value: true }
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
			
			uniform int cylindricalLensSpiralType;	// 0 = logarithmic, 1 = Archimedean, 2 = hyperbolic r=-b/psi
			uniform float radius;	// radius of the Fresnel lens
			uniform bool visible1;	// true if component 1 is visible, false otherwise
			uniform vec3 c1;	// centre of component 1
			uniform float phi1;	// angle by which component 1 is rotated (in radians)
			uniform bool visible2;	// true if component 2 is visible, false otherwise
			uniform vec3 c2;	// centre of component 2
			uniform float phi2;	// angle by which component 2 is rotated (in radians)
			uniform float f1;	// focal length of cylindrical lens at r=1
			uniform float b;	// winding parameter of the spiral
			uniform float b2pi;	// pre-calculated
			uniform float nHalf;	// pre-calculated
			uniform bool alvarezWindingFocusing;
			uniform bool azimuthalPhaseCorrection;
			uniform bool showEquivalentLens;
			uniform float equivalentLensF;

			// video feed from user-facing camera
			uniform sampler2D videoFeedUTexture;
			uniform float halfWidthU;
			uniform float halfHeightU;

			// video feed from environment-facing camera
			uniform sampler2D videoFeedETexture;
			uniform float halfWidthE;
			uniform float halfHeightE;

			// background
			uniform sampler2D backgroundTexture;
			uniform vec4 backgroundColour;
			uniform float halfWidthBackground;
			uniform float halfHeightBackground;

			// the camera's wide aperture
			uniform float videoDistance;
			uniform float focusDistance;
			uniform int noOfRays;
			uniform vec3 apertureXHat;
			uniform vec3 apertureYHat;
			uniform vec3 viewDirection;
			uniform vec3 backgroundCentre;
			uniform float apertureRadius;
			uniform float randomNumbersX[100];
			uniform float randomNumbersY[100];
			// uniform float apertureRadius;
			uniform bool keepVideoFeedForward;

			// rotation matrix that rotates 2D vectors by the angle alpha (in radians)
			// from https://gist.github.com/yiwenl/3f804e80d0930e34a0b33359259b556c
			mat2 getRotationMatrix(float alpha) {
				float s = sin(alpha);
				float c = cos(alpha);
				return mat2(c, s, -s, c);
			}

			// rotate the 2D vector v by the angle alpha (in radians)
			// from https://gist.github.com/yiwenl/3f804e80d0930e34a0b33359259b556c
			vec2 rotate(vec2 v, float alpha) {
				return getRotationMatrix(alpha) * v;
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

			// calculate the number of the winding that corresponds to position (r, phi)
			float calculateN(float r, float phi) {
				switch(cylindricalLensSpiralType)
				{
				case 1:	// ARCHIMEDEAN
					// return floor(((r - b*phi)/b2pi) + 0.5);
					return floor(0.5 + (r - b*phi) / b2pi);
				case 2:	// hyperbolic
					return floor(0.5 + (-1.0/(r*b) - phi)/(2.0*PI));
				case 0:	// LOGARITHMIC
				default:
					return floor(((log(r) - b*phi)/b2pi) + 0.5);
				}
			}

			// For the position (x, y), calculate the derivatives of the phase w.r.t. x and y, divided by k, i.e. (d (phase/k) / d x, d (phase/k) / d y).
			// The spiral is rotated by deltaTheta.
			// r2 is the square of r, which we need to calculate r and which we have already calculated, so we might
			// as well pass it.
			vec2 calculatePhaseGradient(float x, float y, float r2, float f1) {
				// calculate r and phi, the polar coordinates
				float r = sqrt(r2);
				float phi = atan(y, x);	// azimuthal angle, bound to the range [-pi, pi]
				float n = calculateN(r, phi);	// the number of the winding the position (x, y) is on
				float psi = phi + n*2.0*PI;	// (unbound) azimuthal angle psi

				float c;	// common factor
				vec2 v;
				switch(cylindricalLensSpiralType)
				{
				case 1:	// ARCHIMEDEAN
					c = b*(r-b*psi)/(2.0*f1*r2);
					v = vec2(
						c*(-3.0*b*y*psi + r*(y-2.0*x*psi)),
						c*( 3.0*b*x*psi - r*(x+2.0*y*psi))
					);

					if(alvarezWindingFocusing) {
						c = (r-b*psi)*(r-b*psi)/(f1*r2);
						v += vec2(
							c*(-r*x - b*y),
							c*(-r*y + b*x)
						);
					}

					if(azimuthalPhaseCorrection) {
						c = b*b*b*psi*psi / (2.0*f1*r2);
						v += vec2(
							-c*y,
							+c*x
						);
					}

					return v;

					// if(alvarezWindingFocusing) {
					// 	if(azimuthalPhaseCorrection) {
					// 		return vec2(
					// 			-(2.0*r*x + b*(y-2.0*x*psi)) / (2.0*f1),
					// 			-(2.0*r*y - b*(x+2.0*y*psi)) / (2.0*f1)
					// 		);
					// 	} else {
					// 		c = (r - b*psi) / (2.0*f1*r2);
					// 		return vec2(
					// 			-c*(b*r*y + 2.0*r2*x + b*b*y*psi),
					// 			+c*(b*r*x - 2.0*r2*y + b*b*x*psi)
					// 		);
					// 	}
					// } else {
					//  	// no Alvarez winding focussing
					// 	if(azimuthalPhaseCorrection) {
					// 		c = b / (2.0*f1*r2);
					// 		return vec2(
					// 			c*(r2*y - 2.0*r*(r*x+2.0*b*y)*psi + 2.0*b*(r*x+b*y)*psi*psi),
					// 			c*(-2.0*b*b*x*psi*psi - 2.0*b*r*psi*(2.0*x+y*psi) + r2*(x+2.0*y*psi))
					// 		);
					// 	} else {
					// 		c = (r - b*psi) / (2.0*f1*r2);
					// 		return vec2(
					// 			+c*b*(-3.0*b*y*psi + r*(y-2.0*x*psi)),
					// 			-c*b*(-3.0*b*x*psi + r*(x+2.0*y*psi))
					// 		);
					// 	}
					// }
				case 2:	// hyperbolic r = 1/(-b psi)
					c = (b*r*psi + 1.0) / (2.0*b*f1*r2*psi*psi);

					v = vec2(
						c*( y - b*r*y*psi + 2.0*b*r*x*psi*psi),
 						c*(-x + b*r*x*psi + 2.0*b*r*y*psi*psi)
					);

					if(azimuthalPhaseCorrection) {
						c = 1.0 / (2.0*b*f1*r2*psi*psi);
						v += vec2(
							-y*c,
							 x*c
						);
					}		
					
					return v;
				
				case 0:	// LOGARITHMIC
				default:
					float R = exp(b*psi);
					float R2 = R*R;
					if(alvarezWindingFocusing) {
						c = 1.0/(6.0*f1*r2*R);
						v = vec2(
							c*( 4.0*b*exp(3.0*b*psi)*y + 3.0*exp(2.0*b*psi)*r*(x-b*y) - r*r2*(b*y+3.0*x)),
							c*(-4.0*b*exp(3.0*b*psi)*x + 3.0*exp(2.0*b*psi)*r*(y+b*x) + r*r2*(b*x-3.0*y))
						);
					} else {
						c = (exp(b*psi)-r)/(f1*r2);
						v = vec2(
							c*(r*x+b*exp(b*psi)*y),
							c*(r*y-b*exp(b*psi)*x)
						);
					}

					if(azimuthalPhaseCorrection) {
						c = b*R2 / (2.0*f1*r2);
						v += vec2(
							-y*c,
							+x*c
						);
					}

					return v;

				}
			}

			// Pass the current ray (start point p, direction d, brightness factor b) through a spiral lens.
			// c is the centre (principal/nodal) point of the spiral lens, which is in the plane z = c.z
			// deltaTheta is the angle (in radians) by which the component is rotated around the z axis
			void passThroughSpiralLens(
				inout vec3 p, 
				inout vec3 d, 
				inout vec4 b,
				vec3 c,
				float deltaTheta,
				float f1
			) {
				bool isForward;
				propagateForwardToZPlane(p, d, c.z, isForward);

				if(isForward) {
					// there is an intersection with the plane of this component in the ray's forward direction

					// does the intersection point lie within the radius?
					vec2 pixy = (p-c).xy;
					float r2 = dot(pixy, pixy);
					if(r2 < radius*radius) {
						// the intersection point lies inside the radius, so the lens does something to the ray

						// normalise d
						vec3 dN = d/length(d);
						// calculate the phase gradient, which defines the change in the transverse components
						vec2 pRotated = rotate(pixy, deltaTheta);
						vec2 phaseGradient = rotate(calculatePhaseGradient(pRotated.x, pRotated.y, r2, f1), -deltaTheta);
						// transverse components of the outgoing light-ray direction
						vec2 dxy = dN.xy + phaseGradient;
		
						// from the transverse direction, construct a 3D vector by setting the z component such that the length
						// of the vector is 1
						d = vec3(dxy, sign(d.z)*sqrt(1.0 - dot(dxy, dxy)));						

						// lower the brightness factor, giving the light a slightly blue tinge
						b *= vec4(0.9, 0.9, 0.99, 1);
					} 
				}
			}

			void passThroughEquivalentLens(
				inout vec3 p, 
				inout vec3 d, 
				inout vec4 b,
				vec3 c
			) {
				passThroughLens(
					p, d, b,	// the ray
					c,	// centreOfLens
					radius, 
					equivalentLensF,	// focal length
					true	// idealLens
				);

				// lower the brightness factor, giving the light a blue tinge
				// b *= vec4(0.9, 0.9, 0.99, 1);
			}

			// propagate the ray starting at position p and with direction d to the plane containing the background, providing that plane
			// is in the ray's "forward" direction;
			// p becomes the point where the ray intersects the plane;
			// isForward is set to true or false depending on whether the intersection point is forwards or backwards along the ray
			void propagateForwardToBackgroundPlane(
				inout vec3 p, 
				vec3 d, 
				inout bool isForward
			) {
				// calculate the distance in the view direction from the ray start position to c
				float deltaV = dot(backgroundCentre-p, viewDirection);

				// calculate the component in the view direction of the light-ray direction d
				float dV = dot(d, viewDirection);

				// is the intersection with the plane in the ray's "forward" direction?
				isForward = true;	// (dV*deltaV > 0.0);

				// if the intersection is in the forward direction, advance the ray to the plane
				if(isForward) p += d/dV*deltaV;	// set p to the intersection point with the plane
			}

			vec4 getColorOfBackground(
				inout vec3 p, 
				vec3 d, 
				vec4 b,
				sampler2D videoFeedTexture,
				float halfWidth,
				float halfHeight,
				vec4 backgroundColor
			) {
				bool isForward;
				propagateForwardToBackgroundPlane(p, d, isForward);

				// is the intersection in the ray's forward direction?
				if(isForward) {
					float x = dot(p, apertureXHat);
					float y = dot(p, apertureYHat);
					// does the ray intersect the image?
					if((abs(x) < halfWidth) && (abs(y) < halfHeight))
						// yes, the ray intersects the image; take the pixel colour from the camera's video feed
						return texture2D(videoFeedTexture, vec2(0.5-0.5*x/halfWidth, 0.5+0.5*y/halfHeight));
					else 
						// the ray doesn't intersect the image
						return backgroundColor;
				}
				return backgroundColor;	// vec4(0, 1, 0, 1);	// green
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
				vec3 v = intersectionPoint - cameraPosition;	// the "pixel view direction", i.e. a vector from the centre of the camera apertuer to the point on the object the shader is currently "shading"
				vec3 focusPosition = cameraPosition + focusDistance/abs(dot(v, viewDirection))*v;

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
					d = v.z/d.z*d;
	
					// current brightness factor; this will multiply the colour at the end
					vec4 b = vec4(1.0, 1.0, 1.0, 1.0);
	
					if(d.z < 0.0) {
						// the ray is travelling "forwards", in the (-z) direction;
						if(showEquivalentLens) passThroughEquivalentLens(p, d, b, vec3(c1.x, c1.y, 0)); 
						else {
							// pass first through component 1, then component 2, then to environment-facing video feed
							if(visible1) passThroughSpiralLens(p, d, b, c1, phi1,  f1);
							if(visible2) passThroughSpiralLens(p, d, b, c2, phi2, -f1);
						}
						if(keepVideoFeedForward) 
							color = getColorOfBackground(p, d, b, backgroundTexture, halfWidthBackground, halfHeightBackground, backgroundColour);
							// color = getColorOfVideoFeed(p, d, b, videoFeedETexture, halfWidthE, halfHeightE, vec4(1, 1, 1, 1.0));
						else color = getColorOfVideoFeed(p, d, b, -videoDistance, videoFeedETexture, halfWidthE, halfHeightE, vec4(1, 1, 1, 1.0));
					} else {
						// the ray is travelling "backwards", in the (+z) direction;
						if(showEquivalentLens) passThroughEquivalentLens(p, d, b, vec3(c1.x, c1.y, 0)); 
						else {
							// pass first through component 2, then component 1, then to user-facing video feed
							if(visible2) passThroughSpiralLens(p, d, b, c2, phi2, -f1);
							if(visible1) passThroughSpiralLens(p, d, b, c1, phi1,  f1);
						}
						if(keepVideoFeedForward) 
							color = getColorOfBackground(p, d, b, backgroundTexture, halfWidthBackground, halfHeightBackground, backgroundColour);
							// color = getColorOfVideoFeed(p, d, b, videoFeedETexture, halfWidthE, halfHeightE, vec4(1, 1, 1, 1.0));
						else color = getColorOfVideoFeed(p, d, b, videoDistance, videoFeedUTexture, halfWidthU, halfHeightU, vec4(1, 0, 0, 1.0));
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

// see https://github.com/mrdoob/three.js/blob/master/examples/webgl_animation_skinning_additive_blending.html
function createGUI() {
	// const 
	gui = new GUI();
	// gui.hide();

	GUIParams = {
		show: function() {
			show = (show + 1) % 5;
			showControl.name( 'Component(s): ' + show2String() );
		},
		// cycleShow: function() {
		// 	show = (show + 1) % 4;
		// 	showControl.setValue( show2String() );
		// },
		// visible1: raytracingSphereShaderMaterial.uniforms.visible1.value,
		// visible2: raytracingSphereShaderMaterial.uniforms.visible2.value,
		'deltaThetaDeg': deltaTheta / Math.PI * 180.,
		// 'Spiral type': raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value,	// 0 = logarithmic, 1 = Archimedean, 2 = hyperbolic
		spiralType: function() { 
			raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value = (raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value+1) % 3;
			spiralTypeControl.name( 'Spiral type: ' + cylindricalLensSpiralType2String() );
		},
		// cycleSpiralType: function() { 
		// 	raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value = (raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value+1) % 3;
		// 	spiralTypeControl.setValue( getCylindricalLensSpiralTypeString() );
		// },
		'Radius': raytracingSphereShaderMaterial.uniforms.radius.value,	// radius of the Fresnel lens
		yXR: yXR, 
		pDiopterPerDegree: qAFL * (Math.PI / 180.0),	// convert to diopter per degree
		// '<i>f</i><sub>1</sub>': raytracingSphereShaderMaterial.uniforms.f1.value,	// focal length of cylindrical lens 1 (for Arch. spiral at r=1, for hyp. spiral at phi=1)
		'&Delta;<i>z</i>': deltaZ,
		'b': raytracingSphereShaderMaterial.uniforms.b.value,	// winding parameter of the spiral
		// 'Alvarez winding focussing': raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value,
		windingFocussing: function() {
			windingFocussing = (windingFocussing + 1) % 3;
			windingFocussingControl.name( 'Winding focussing: ' + windingFocussing2String() );
			if(windingFocussing === 1) {
				deltaZ = deltaZMin;
				deltaZControl.setValue(deltaZ);
			}
			if((windingFocussing === 2) && ((raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value != 0) || (deltaTheta < 0))) {
				postStatus('Warning: Winding focussing through separation works only for log. spirals and &Delta;&theta; > 0');
			}
			deltaZControl.disable(windingFocussing === 2);	
		},
		azimuthalPhaseCorrection: function() {
			azimuthalPhaseCorrection = (azimuthalPhaseCorrection + 1) % 2;
			azimuthalPhaseCorrectionControl.name( 'Azimuthal phase correction: ' + azimuthalPhaseCorrection2String() );
		},
		// 'Show equivalent ideal lens': raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value,
		'Horiz. FOV (&deg;)': fovScreen,
		'Aperture radius': apertureRadius,
		'tan<sup>-1</sup>(focus. dist.)': atanFocusDistance,
		'No of rays': noOfRays,
		'Env.-facing cam. (&deg;)': fovVideoFeedE,
		'User-facing cam. (&deg;)': fovVideoFeedU,
		'tan<sup>-1</sup>(distance)': Math.atan(raytracingSphereShaderMaterial.uniforms.videoDistance.value),
		// 'Autofocus': autofocus,
		autofocus: function() { 
			autofocus = !autofocus;
			autofocusControl.name( 'Autofocus: ' + (autofocus?'On':'Off') );
			focusDistanceControl.disable(autofocus);
		},	// (autofocus?'On':'Off'),
		'Video feed forward': raytracingSphereShaderMaterial.uniforms.keepVideoFeedForward.value,
		// 'Image': background,
		// background: background2String(),
		background: function() { 
			background = (background + 1) % 4; 
			backgroundControl.name( 'Background: ' + background2String() );
		 },
		// cycleBackground: function() { 
		// 	background = (background + 1)%4; 
		// 	backgroundControl.setValue( background2String() );
		// },
		'Point forward (in -<b>z</b> direction)': pointForward,
		'Show/hide info': toggleInfoVisibility,
		'Restart camera video': function() { 
			recreateVideoFeeds(); 
			postStatus("Restarting video stream");
		}
	}

	gui.add( GUIParams, 'deltaThetaDeg', -180, 180, .1 )
	.name('&Delta;&theta; (&deg;)')
	.onChange( (a) => { deltaTheta = a/180.0*Math.PI; } );

	// const folderComponents = gui.addFolder( 'Optical components' );
	showControl = gui.add( GUIParams, 'show' ).name( 'Component(s): ' + show2String() );
	// showControl.domElement.addEventListener( 'click', () => {
	// 	show = (show + 1) % 4;
	// 	showControl.setValue( show2String() );
	// } );
	// gui.add( GUIParams, 'visible1' ).name('Show component 1').onChange( (v) => { raytracingSphereShaderMaterial.uniforms.visible1.value = v; } );
	// gui.add( GUIParams, 'visible2' ).name('Show component 2').onChange( (v) => { raytracingSphereShaderMaterial.uniforms.visible2.value = v; } );
	// gui.add( GUIParams, 'Spiral type', 
	// 	{ 
	// 		'Logarithmic': 0, 
	// 		'Archimedean': 1, 
	// 		'Hyperbolic': 2, 
	// 	} ).onChange( (s) => { raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value = s; });
	spiralTypeControl = gui.add( GUIParams, 'spiralType' ).name( 'Spiral type: ' + cylindricalLensSpiralType2String() );
	// spiralTypeControl.domElement.addEventListener( 'click', () => { 
	// 	raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value = (raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value+1) % 3;
	// 	spiralTypeControl.setValue( cylindricalLensSpiralType2String() );
	// } );
	// spiralTypeControl.disable(true);
	// gui.add( GUIParams, 'cycleSpiralType' ).name( 'Cycle spiral type' );
	gui.add( GUIParams, 'b', 0.001, 
		0.1, 
		0.01 )
		.name('<i>b</i>').onChange( (b) => {raytracingSphereShaderMaterial.uniforms.b.value = b; } );
	gui.add( GUIParams, 'pDiopterPerDegree', -.1, .1, 0.0001 )
		.name( '<i>q</i> (diopter / &deg;)' )
		.onChange( (qDiopterPerDegree) => {
			qAFL = qDiopterPerDegree / (Math.PI / 180.0);
		} );
	// gui.add( GUIParams, '<i>f</i><sub>1</sub>', -1, 
	// 	1, 
	// 	0.01 ).onChange( (f1) => { raytracingSphereShaderMaterial.uniforms.f1.value = f1; } );
	deltaZControl = gui.add( GUIParams, '&Delta;<i>z</i>', deltaZMin, 0.01, 0.00001).onChange( (dz) => { deltaZ = dz; } );
	windingFocussingControl = gui.add( GUIParams, 'windingFocussing' ).name( 'Winding focussing: ' + windingFocussing2String() );	// .name( 'Winding focussing' );
	azimuthalPhaseCorrectionControl = gui.add( GUIParams, 'azimuthalPhaseCorrection' ).name( 'Azimuthal phase correction: ' + azimuthalPhaseCorrection2String() );
	// windingFocussingControl.domElement.addEventListener( 'click', () => {
	// 	windingFocussing = (windingFocussing + 1) % 3;
	// 	windingFocussingControl.setValue( windingFocussing2String() );
	// 	if(windingFocussing === 1) {
	// 		deltaZ = deltaZMin;
	// 		deltaZControl.setValue(deltaZ);
	// 	}
	// 	if((windingFocussing === 2) && ((raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value != 0) || (deltaTheta < 0))) {
	// 		postStatus('Warning: Winding focussing through separation works only for log. spirals and &Delta;&theta; > 0');
	// 	}
	// 	deltaZControl.disable(windingFocussing === 2);
	// } );
	// gui.add( GUIParams, 'Alvarez winding focussing' ).onChange( (a) => { raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value = a; } );
	// gui.add( GUIParams, 'Show equivalent ideal lens' ).onChange( (s) => {raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value = s; } );
	gui.add( GUIParams, 'Radius', 0.1, 10, 0.1 ).onChange( (r) => {raytracingSphereShaderMaterial.uniforms.radius.value = r; } );
	gui.add( GUIParams, 'yXR', 0, 2, 0.1 ).name('<i>y</i><sub>XR</sub>').onChange( (y) => {yXR = y;} );

	// const folderBackground = gui.addFolder( 'Background' );
	// gui.add( GUIParams, 'Image', 
	// { 
	// 	'Camera video': 0, 
	// 	'Dr TIM': 1,
	// 	'Buzz Aldrin': 2,
	// 	// 'Pillars of creation': 3,
	// 	// 'Lunch atop a skyscraper': 4,
	// 	'Descent from Half Dome': 3
	// 	// 'Blue marble': 6
	// } ).name( 'Background' ).onChange( (b) => { background = b; });
	// backgroundControl = gui.add( GUIParams, 'background' ).name( 'Background' );
	// backgroundControl.domElement.addEventListener( 'click', () => { 
	// 	background = (background + 1) % 4; 
	// 	backgroundControl.setValue( background2String() );
	// } );
	backgroundControl = gui.add( GUIParams, 'background' ).name( 'Background: ' + background2String() );
	// backgroundControl.disable(true);
	// gui.add( GUIParams, 'cycleBackground').name( 'Cycle background' );
	gui.add( GUIParams, 'tan<sup>-1</sup>(distance)', Math.atan(0.1), 0.5*Math.PI).onChange( (a) => { raytracingSphereShaderMaterial.uniforms.videoDistance.value = Math.tan(a); } );
	gui.add( GUIParams, 'Horiz. FOV (&deg;)', 10, 170, 1).onChange( (fov) => { fovBackground = fov; });   
	// folderBackground.add( params, 'Env.-facing cam. (&deg;)', 10, 170, 1).onChange( (fov) => { fovVideoFeedE = fov; });   
	// folderBackground.add( params, 'User-facing cam. (&deg;)', 10, 170, 1).onChange( (fov) => { fovVideoFeedU = fov; });   
	gui.add( GUIParams, 'Restart camera video');
	// folderBackground.close();

	// const folderVirtualCamera = gui.addFolder( 'Virtual camera' );
	gui.add( GUIParams, 'Horiz. FOV (&deg;)', 10, 170, 1).onChange( setScreenFOV );
	gui.add( GUIParams, 'Aperture radius', 0.0, 1.0, 0.01).onChange( (r) => { apertureRadius = r; } );
	// gui.add( GUIParams, 'Autofocus' ).onChange( (b) => { autofocus = b; focusDistanceControl.disable(autofocus); } );
	autofocusControl = gui.add( GUIParams, 'autofocus' ).name( 'Autofocus: ' + (autofocus?'On':'Off') );
	// autofocusControl.domElement.addEventListener( 'click', () => { 
	// 	autofocus = !autofocus;
	// 	autofocusControl.setValue( (autofocus?'On':'Off') );
	// 	focusDistanceControl.disable(autofocus);
	// } );
	focusDistanceControl = gui.add( GUIParams, 'tan<sup>-1</sup>(focus. dist.)', 
		//Math.atan(0.1), 
		-0.5*Math.PI,
		0.5*Math.PI,
		0.001
	).onChange( (a) => { atanFocusDistance = a; } );
	focusDistanceControl.disable(autofocus);
	// folderVirtualCamera.add( atanFocusDistance, 'atan focus dist', -0.5*Math.PI, +0.5*Math.PI ).listen();
	gui.add( GUIParams, 'No of rays', 1, 100, 1).onChange( (n) => { noOfRays = n; } );
	gui.add( GUIParams, 'Point forward (in -<b>z</b> direction)' );
	// folderVirtualCamera.close();

	// const folderSettings = gui.addFolder( 'Other controls' );
	// // folderSettings.add( params, 'Video feed forward' ).onChange( (b) => { raytracingSphereShaderMaterial.uniforms.keepVideoFeedForward.value = b; } );
	// // folderSettings.add( params, 'Lenslet type', { 'Ideal thin': true, 'Phase hologram': false } ).onChange( (t) => { raytracingSphereShaderMaterial.uniforms.idealLenses.value = t; });
	// // folderSettings.add( params, 'Ideal lenses').onChange( (b) => { raytracingSphereShaderMaterial.uniforms.idealLenses.value = b; } );
	// folderSettings.add( params, 'Show/hide info');
	// folderSettings.close();
}

function cylindricalLensSpiralType2String() {
	switch( raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value ) {
		case 0:	
			return "Logarithmic";
		case 1: 
			return "Archimedean";
		case 2:
		default:
			return "Hyperbolic";
	}
}
  
function background2String() {
	switch (background) { 
	case 0: return 'Camera video';
	case 1: return 'Dr TIM';
	case 2: return 'Buzz Aldrin';
	case 3: return 'Descent from Half Dome';
	default: return 'Undefined';
	}
}

function show2String() {
	switch(show) {
	case 0: return 'Both parts';
	case 1: return 'Part 1';
	case 2: return 'Part 2';
	case 3: return 'Equivalent lens';
	case 4: return 'None';
	default: return 'Undefined';
	}
}

function windingFocussing2String() {
	switch(windingFocussing) {
	case 0: return 'None';
	case 1: return 'Alvarez';
	case 2: return 'Separation';	// (log spiral &amp; &Delta;&theta; > 0)';
	default: return 'Undefined';
	}
}

function azimuthalPhaseCorrection2String() {
	switch( azimuthalPhaseCorrection ) {
		case 0: return 'Off';
		case 1: return 'On';
		default: return 'Undefined';
	}
}

function addXRInteractivity() {
	// see https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_sandbox.html

	// the two hand controllers

	const geometry = new THREE.BufferGeometry();
	geometry.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );

	const controller1 = renderer.xr.getController( 0 );
	controller1.add( new THREE.Line( geometry ) );
	scene.add( controller1 );

	const controller2 = renderer.xr.getController( 1 );
	controller2.add( new THREE.Line( geometry ) );
	scene.add( controller2 );

	//

	const controllerModelFactory = new XRControllerModelFactory();

	const controllerGrip1 = renderer.xr.getControllerGrip( 0 );
	controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
	scene.add( controllerGrip1 );

	const controllerGrip2 = renderer.xr.getControllerGrip( 1 );
	controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
	scene.add( controllerGrip2 );

	//

	const group = new InteractiveGroup( renderer, camera );
	group.listenToPointerEvents( renderer, camera );
	group.listenToXRControllerEvents( controller1 );
	group.listenToXRControllerEvents( controller2 );
	scene.add( group );

	const mesh = new HTMLMesh( gui.domElement );
	mesh.position.x = - 0.75;
	mesh.position.y = 1.5;
	mesh.position.z = - 0.5;
	mesh.rotation.y = Math.PI / 4;
	mesh.scale.setScalar( 2 );
	group.add( mesh );	
}

// function updateGUI() {
// 	// see https://stackoverflow.com/questions/16166440/refresh-dat-gui-with-new-values
// 	for (var i = 0; i < Object.keys(gui.__folders).length; i++) {
// 		var key = Object.keys(gui.__folders)[i];
// 		for (var j = 0; j < gui.__folders[key].__controllers.length; j++ )
// 		{
// 			gui.__folders[key].__controllers[j].updateDisplay();
// 		}
// 	}
// }

// function refreshGUI() {
// 	let folderComponentsClosed, folderBackgroundClosed, folderVirtualCameraClosed;

// 	// if the gui exits, ...
// 	if(gui) {
// 		// ... take note of which folders are currently closed...
// 		// TODO this is not working
// 		folderComponentsClosed = folderComponents.closed;
// 		folderBackgroundClosed = folderBackground.closed;
// 		folderVirtualCameraClosed = folderVirtualCamera.closed;

// 		postStatus(`folderComponentsClosed=${folderComponentsClosed} folderBackgroundClosed=${folderBackgroundClosed} folderVirtualCameraClosed=${folderVirtualCameraClosed}`);
// 		// ... before destroying the old GUI
// 		gui.destroy(); 
// 	} else {
// 		folderComponentsClosed = false;
// 		folderBackgroundClosed = false;
// 		folderVirtualCameraClosed = true;
// 	}

// 	// create a new gui...
// 	createGUI();

// 	// ... making sure the folders are closed again as before
// 	if(folderComponentsClosed) folderComponents.close();
// 	if(folderBackgroundClosed) folderBackground.close();
// 	if(folderVirtualCameraClosed) folderVirtualCamera.close();
// }

// return the focal length of the Fresnel lens
function calculateEquivalentLensF() {
	return 1/(qAFL*deltaTheta);
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

function loadBackgroundImages() {
	const textureLoader = new THREE.TextureLoader();
	// textureLoader.crossOrigin = "Anonymous";

	textureTIM = textureLoader.load('Dr_TIM_cropped.jpg');
	aspectRatioTIM = 3972/1787;
	backgroundColourTIM = new THREE.Vector4(0.75, 0.62, 0.37, 1);

	// textureEarthrise = textureLoader.load('NASA-Apollo8-Dec24-Earthrise.jpeg');	// https://en.wikipedia.org/wiki/File:NASA-Apollo8-Dec24-Earthrise.jpg -- public domain
	// aspectRatioEarthrise = 1.0;
	// backgroundColourEarthrise = new THREE.Vector4(0, 0, 0, 1);

	textureAldrin = textureLoader.load('Aldrin_Apollo_11_modified.jpeg');	// https://en.wikipedia.org/wiki/File:Aldrin_Apollo_11.jpg -- public domain
	aspectRatioAldrin = 1.0;
	backgroundColourAldrin = new THREE.Vector4(0, 0, 0, 1);

	// texturePillars = textureLoader.load('Pillars_2014_HST_denoise_0.6_12.jpg');	// https://commons.wikimedia.org/wiki/File:Pillars_2014_HST_denoise_0.6_12.jpg -- public domain
	// // texturePillars = textureLoader.load('Eagle_nebula_pillars.jpeg');
	// aspectRatioPillars = 2434/2400;
	// backgroundColourPillars = new THREE.Vector4(0, 0, 0, 1);

	// textureLunch = textureLoader.load('Lunch_atop_a_Skyscraper_-_Charles_Clyde_Ebbets_cropped.jpeg');	// https://en.wikipedia.org/wiki/File:Lunch_atop_a_Skyscraper_-_Charles_Clyde_Ebbets.jpg -- public domain
	// aspectRatioLunch = 2560/1680;	// 2012;
	// backgroundColourLunch = new THREE.Vector4(0.73, 0.73, 0.73, 1);

	textureHalfDome = textureLoader.load('HalfDome_cropped.jpeg');	// private photo
	aspectRatioHalfDome = 1062/918;	// 1532/1111;
	backgroundColourHalfDome = new THREE.Vector4(0.76, 0.82, 0.92, 1);

	// textureBlueMarble = textureLoader.load('The_Blue_Marble_(remastered).jpeg');	// https://en.wikipedia.org/wiki/The_Blue_Marble#/media/File:The_Blue_Marble_(remastered).jpg
	// aspectRatioBlueMarble = 2048/2048;
	// backgroundColourBlueMarble = new THREE.Vector4(0, 0, 0, 1);
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
// // see https://github.com/mrdoob/three.js/blob/master/examples/webgl_animation_skinning_additive_blending.html
// function createGUI() {
// 	// const 
// 	gui = new GUI();
// 	// gui.hide();

// 	const params = {
// 		'Show component 1': raytracingSphereShaderMaterial.uniforms.visible1.value,
// 		'Show component 2': raytracingSphereShaderMaterial.uniforms.visible2.value,
// 		'Rotation angle (&deg;)': deltaTheta / Math.PI * 180.,
// 		'Spiral type': raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value,	// 0 = logarithmic, 1 = Archimedean, 2 = hyperbolic
// 		'Radius': raytracingSphereShaderMaterial.uniforms.radius.value,	// radius of the Fresnel lens
// 		'<i>f</i><sub>1</sub>': raytracingSphereShaderMaterial.uniforms.f1.value,	// focal length of cylindrical lens 1 (for Arch. spiral at r=1, for hyp. spiral at phi=1)
// 		'&Delta;<i>z</i>': deltaZ,
// 		'<i>b</i>': raytracingSphereShaderMaterial.uniforms.b.value,	// winding parameter of the spiral
// 		'Alvarez winding focussing': raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value,
// 		'Show equivalent ideal lens': raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value,
// 		'Horiz. FOV (&deg;)': fovScreen,
// 		'Aperture radius': apertureRadius,
// 		'tan<sup>-1</sup>(focus. dist.)': Math.atan(focusDistance),
// 		'No of rays': noOfRays,
// 		'Env.-facing cam. (&deg;)': fovVideoFeedE,
// 		'User-facing cam. (&deg;)': fovVideoFeedU,
// 		'tan<sup>-1</sup>(video dist.)': Math.atan(raytracingSphereShaderMaterial.uniforms.videoDistance.value),
// 		'Point (virtual) cam. forward (in -<b>z</b> direction)': pointForward,
// 		'Show/hide info': toggleInfoVisibility,
// 		'Restart video streams': function() { 
// 			recreateVideoFeeds(); 
// 			postStatus("Restarting video stream");
// 		}
// 	}

// 	gui.add( params, 'Rotation angle (&deg;)', -180, 180, 1 ).onChange( (a) => { deltaTheta = a/180.0*Math.PI; } );

// 	const folderComponents = gui.addFolder( 'Optical components' );
// 	folderComponents.add( params, 'Show component 1').onChange( (v) => { raytracingSphereShaderMaterial.uniforms.visible1.value = v; } );
// 	folderComponents.add( params, 'Show component 2').onChange( (v) => { raytracingSphereShaderMaterial.uniforms.visible2.value = v; } );
// 	folderComponents.add( params, 'Spiral type', 
// 		{ 
// 			'Logarithmic': 0, 
// 			'Archimedean': 1, 
// 			'Hyperb. <i>r</i>=1/(<i>b&theta;</i>)': 2
// 		} ).onChange( (s) => { raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value = s; });
// 	folderComponents.add( params, '<i>b</i>', 0.001, 0.1).onChange( (b) => {raytracingSphereShaderMaterial.uniforms.b.value = b; } );
// 	folderComponents.add( params, '<i>f</i><sub>1</sub>', -10*1, 10*1).onChange( (f1) => { raytracingSphereShaderMaterial.uniforms.f1.value = f1; } );
// 	folderComponents.add( params, '&Delta;<i>z</i>', 0.00001, 0.1).onChange( (dz) => { deltaZ = dz; } );
// 	folderComponents.add( params, 'Alvarez winding focussing' ).onChange( (a) => { raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value = a; } );
// 	folderComponents.add( params, 'Show equivalent ideal lens' ).onChange( (s) => {raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value = s; } );
// 	folderComponents.add( params, 'Radius', 0.1, 10 ).onChange( (r) => {raytracingSphereShaderMaterial.uniforms.radius.value = r; } );
	
// 	const folderVirtualCamera = gui.addFolder( 'Virtual camera' );
// 	folderVirtualCamera.add( params, 'Horiz. FOV (&deg;)', 10, 170, 1).onChange( setScreenFOV );
// 	folderVirtualCamera.add( params, 'Aperture radius', 0.0, 1.0).onChange( (r) => { apertureRadius = r; } );
// 	folderVirtualCamera.add( params, 'tan<sup>-1</sup>(focus. dist.)', 
// 		//Math.atan(0.1), 
// 		-0.5*Math.PI,
// 		0.5*Math.PI
// 	).onChange( (a) => { focusDistance = Math.tan(a); } );
// 	folderVirtualCamera.add( params, 'No of rays', 1, 100, 1).onChange( (n) => { noOfRays = n; } );
// 	folderVirtualCamera.close();

// 	const folderDevice = gui.addFolder( 'Device cameras horiz. FOV' );
// 	folderDevice.add( params, 'Env.-facing cam. (&deg;)', 10, 170, 1).onChange( (fov) => { fovVideoFeedE = fov; });   
// 	folderDevice.add( params, 'User-facing cam. (&deg;)', 10, 170, 1).onChange( (fov) => { fovVideoFeedU = fov; });   
// 	folderDevice.close();

// 	const folderSettings = gui.addFolder( 'Other controls' );
// 	folderSettings.add( params, 'tan<sup>-1</sup>(video dist.)', Math.atan(0.1), 0.5*Math.PI).onChange( (a) => { raytracingSphereShaderMaterial.uniforms.videoDistance.value = Math.tan(a); } );
// 	folderSettings.add( params, 'Lenslet type', { 'Ideal thin': true, 'Phase hologram': false } ).onChange( (t) => { raytracingSphereShaderMaterial.uniforms.idealLenses.value = t; });
// 	// folderSettings.add( params, 'Ideal lenses').onChange( (b) => { raytracingSphereShaderMaterial.uniforms.idealLenses.value = b; } );
// 	folderSettings.add( params, 'Point (virtual) cam. forward (in -<b>z</b> direction)');
// 	folderSettings.add( params, 'Show/hide info');
// 	folderSettings.add( params, 'Restart video streams');
// 	folderSettings.close();
// }

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
	// renderer.xr.getCamera() HERE
	// are we in VR mode?
	if(renderer.xr.enabled && renderer.xr.isPresenting) {
		// see https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_teleport.html
		const offsetPosition = { x: 1, y: 0, z: 1, w: 1 };
		const offsetRotation = new THREE.Quaternion();
		const transform = new XRRigidTransform( offsetPosition, offsetRotation );
		const teleportSpaceOffset = baseReferenceSpace.getOffsetReferenceSpace( transform );

		renderer.xr.setReferenceSpace( teleportSpaceOffset );

		// renderer.xr.getCamera().position.x = 0;
		// // renderer.xr.getCamera().position.y = 0;
		// renderer.xr.getCamera().position.z = r;	
	} else {
		let r = camera.position.length();
		camera.position.x = 0;
		camera.position.y = 0;
		camera.position.z = r;
		controls.update();
	}
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

		storedPhotoDescription = 
			// `${name}_deltaTheta=${(deltaTheta*180.0/Math.PI).toPrecision(4)}`;
			appName + `_deltaTheta=${(deltaTheta*180.0/Math.PI).toPrecision(4)}`;
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
			const file = new File([blob], storedPhotoDescription+'.png', { type: blob.type });

			// create an html blob containing the parameter values
			const blobParams = new Blob(["<html>"+storedPhotoInfoString+"</html>"], { type: "text/html" });
			const fileParams = new File([blobParams], storedPhotoDescription+'.html', { type: blob.type });

			// Use the Web Share API to share the screenshot
			if (navigator.share) {
				navigator.share({
					title: storedPhotoDescription,
					// text: storedPhotoInfoString,
					files: [file, fileParams],
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
	status = document.getElementById('status');
	// see https://stackoverflow.com/questions/15248872/dynamically-create-2d-text-in-three-js
	// status.style.position = 'absolute';
	// status.style.backgroundColor = "rgba(0, 0, 0, 0.3)";	// semi-transparent black
	// status.style.color = "White";
	// status.style.fontFamily = "Arial";
	// status.style.fontSize = "9pt";
	// status.style.bottom = 0 + 'px';
	// status.style.left = 0 + 'px';
	// status.style.zIndex = 1;
	// document.body.appendChild(status);	
	postStatus("Welcome to SpiralFresnelFrenzy, the premier AR simulation tool for adaptive spiral Fresnel lenses!");
}

function postStatus(text) {
	status.innerHTML = '&nbsp;'+text;
	console.log('status: '+text);

	// show the text only for 3 seconds
	statusTime = new Date().getTime();
	setTimeout( () => { if(new Date().getTime() - statusTime > 2999) status.innerHTML = '&nbsp;'+appName+', University of Glasgow, <a href="https://github.com/jkcuk/'+appName+'">https://github.com/jkcuk/'+appName+'</a>' }, 3000);
}

function getInfoString() {
	return `<h4>Spiral Fresnel lens</h4>\n` +
		'Components shown = ' + show2String() + '<br>\n' +
		// `Show component 1 `+ (raytracingSphereShaderMaterial.uniforms.visible1.value?'&check;':'&cross;')+`<br>\n` +
		// `Show component 2 `+ (raytracingSphereShaderMaterial.uniforms.visible2.value?'&check;':'&cross;')+`<br>\n` +
		`Rotation angle, &Delta;&theta; = ${(deltaTheta*180.0/Math.PI).toPrecision(4)}&deg;<br>\n` +
		'Spiral type = ' + cylindricalLensSpiralType2String() + '<br>\n' +
		`Winding parameter, <i>b</i> = ${raytracingSphereShaderMaterial.uniforms.b.value.toPrecision(4)}<br>\n` +	// winding parameter of the spiral
		`Ratio of focal power to rotation angle, <i>p</i> = ${(qAFL * (Math.PI / 180.0)).toPrecision(4)} diopter/&deg;<br>\n` +	// ratio of focal power to rotation angle
		// `<i>f</i><sub>1</sub> = ${raytracingSphereShaderMaterial.uniforms.f1.value.toPrecision(4)}<br>\n` +	// focal length of cylindrical lens 1 (for Arch. spiral at r=1, for hyp. spiral at phi=1)
		`&Delta;<i>z</i> = ${deltaZ.toPrecision(4)}<br>\n` +
		'Winding focussing = ' + windingFocussing2String() + '<br>\n' +
		(((windingFocussing === 2) && ((raytracingSphereShaderMaterial.uniforms.cylindricalLensSpiralType.value != 0) || (deltaTheta < 0))) ? '<span style="color:red;">*** Warning: separation-based winding focussing only works for logarithmic-spiral lenses and &Delta;&theta; > 0! ***</span><br>\n' : '') +
		// 'Alvarez winding focussing ' + (raytracingSphereShaderMaterial.uniforms.alvarezWindingFocusing.value?'&check;':'&cross;')+`<br>\n` +
		`Clear-aperture radius = ${raytracingSphereShaderMaterial.uniforms.radius.value.toPrecision(4)}<br>\n` +	// radius of the Fresnel lens
		// `<h4>Equivalent lens</h4>\n` +
		// `Show instead of spiral Fresnel lens `+ (raytracingSphereShaderMaterial.uniforms.showEquivalentLens.value?'&check;':'&cross;')+`<br>\n` +
		`Focal length, <i>F</i> = ${calculateEquivalentLensF().toPrecision(4)}\n` +
		// 'Lenslet type: '+(raytracingSphereShaderMaterial.uniforms.idealLenses.value?'Ideal thin lenses':'Phase holograms') + "<br>\n" +
		'<h4>Background</h4>\n' +
		`Image = ` + background2String() + `<br>\n` +
 		`Distance from origin = ${raytracingSphereShaderMaterial.uniforms.videoDistance.value.toPrecision(4)}<br>\n` +	// (user-facing) camera
		`Horizontal field of view = ${fovBackground.toPrecision(4)}&deg;\n` +
		// `User-facing camera = ${fovVideoFeedU.toPrecision(4)}&deg;<br>\n` +	// (user-facing) camera
		// `Environment-facing camera = ${fovVideoFeedE.toPrecision(4)}&deg;<br>\n` +	// (environment-facing) camera
		`<h4>Virtual camera</h4>\n` +
		`Position = (${camera.position.x.toPrecision(4)}, ${camera.position.y.toPrecision(4)}, ${camera.position.z.toPrecision(4)})<br>\n` +
		`Horiz. FOV = ${fovScreen.toPrecision(4)}<br>\n` +
		`Aperture radius = ${apertureRadius.toPrecision(4)}<br>\n` +
		`Focussing distance = ${Math.tan(atanFocusDistance).toPrecision(4)}<br>\n` +
		`Number of rays = ${noOfRays}\n` +
		`<h4>Stored photo information</h4>\n` +
		`description/name = ${storedPhotoDescription}\n` +
		'<h4>Background image information</h4>\n' +
		// 'Earthrise: <a href="https://en.wikipedia.org/wiki/File:NASA-Apollo8-Dec24-Earthrise.jpg">https://en.wikipedia.org/wiki/File:NASA-Apollo8-Dec24-Earthrise.jpg</a><br>\n' +
		'"Buzz Aldrin": based on <a href="https://en.wikipedia.org/wiki/File:Aldrin_Apollo_11.jpg">https://en.wikipedia.org/wiki/File:Aldrin_Apollo_11.jpg</a><br>\n' +
		// 'Pillars of creation: <a href="https://commons.wikimedia.org/wiki/File:Pillars_2014_HST_denoise_0.6_12.jpg">https://commons.wikimedia.org/wiki/File:Pillars_2014_HST_denoise_0.6_12.jpg</a><br>\n' +
		// 'Lunch atop a skyscraper: <a href="https://en.wikipedia.org/wiki/File:Lunch_atop_a_Skyscraper_-_Charles_Clyde_Ebbets.jpg">https://en.wikipedia.org/wiki/File:Lunch_atop_a_Skyscraper_-_Charles_Clyde_Ebbets.jpg</a><br>\n' +
		'"Dr TIM" and "Descent from Half Dome": own work by the authors<br>\n' +
		'All images used are in the public domain.<br>\n' +
		`<h4>${appName}</h4>\n` +
		`${appName} is ${appDescription}.`
		;
		console.log("*");
}

function refreshInfo() {
	if(showingStoredPhoto) setInfo( storedPhotoInfoString );
	else setInfo( getInfoString() );

	if(info.style.visibility === "visible") setTimeout( refreshInfo , 100);	// refresh again a while
}

/** 
 * Add a text field to the top left corner of the screen
 */
function createInfo() {
	info = document.getElementById('info');
	info.innerHTML = "-- nothing to show (yet) --";
}

function setInfo(text) {
	info.innerHTML = text;
	// console.log('info: '+text);
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