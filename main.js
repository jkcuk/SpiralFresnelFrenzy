
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

let name = 'Resona-THOR';

let scene;
let aspectRatioVideoFeedU = 4.0/3.0;
let aspectRatioVideoFeedE = 4.0/3.0;
let renderer;
let videoFeedU, videoFeedE;	// feeds from user/environment-facing cameras
let videoFeedUTexture, videoFeedETexture;
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

let raytracingSphereRadius = 20.0;

// camera with wide aperture
let apertureRadius = 0.0;
let atanFocusDistance = Math.atan(3e8);	// 1 light second
let noOfRays = 1;
let autofocus = false;

// the status text area
let status;	// = document.createElement('div');
let statusTime;	// the time the last status was posted

// the info text area
let info;

// the menu
let gui;
let GUIParams;
let focusDistanceControl;


// true if stored photo is showing
let showingStoredPhoto = false;
let storedPhoto;
let storedPhotoDescription;
let storedPhotoInfoString;

// my Canon EOS450D
const click = new Audio('./click.m4a');


init();
animate();

function init() {
	// create the info element first so that any problems can be communicated
	createStatus();

	scene = new THREE.Scene();
	// scene.background = new THREE.Color( 'skyblue' );
	let windowAspectRatio = window.innerWidth / window.innerHeight;
	camera = new THREE.PerspectiveCamera( fovScreen, windowAspectRatio, 0.1, 2*raytracingSphereRadius + 1 );
	camera.position.z = 0;
	screenChanged();
	
	renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.xr.enabled = true;
	document.body.appendChild( VRButton.createButton( renderer ) );	// for VR content
	document.body.appendChild( renderer.domElement );
	// document.getElementById('livePhoto').appendChild( renderer.domElement );

	createVideoFeeds();

	addRaytracingSphere();

	// user interface

	addEventListenersEtc();

	addOrbitControls();

	// the controls menu
	// refreshGUI();
	createGUI();

	addXRInteractivity();

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

function updateUniforms() {

	let aspectRatioBackground;
	
	raytracingSphereShaderMaterial.uniforms.backgroundTexture.value = videoFeedETexture;
		aspectRatioBackground = aspectRatioVideoFeedE;
		raytracingSphereShaderMaterial.uniforms.backgroundColour.value = new THREE.Vector4(0, 0, 0, 1);	// black

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
	camera.getWorldDirection(viewDirection);
	viewDirection.normalize();
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
	backgroundCentre.copy(camera.position);
	backgroundCentre.addScaledVector(viewDirection, raytracingSphereShaderMaterial.uniforms.videoDistance.value);
	raytracingSphereShaderMaterial.uniforms.noOfRays.value = noOfRays;
	raytracingSphereShaderMaterial.uniforms.apertureXHat.value.copy(apertureBasisVector1);
	raytracingSphereShaderMaterial.uniforms.apertureYHat.value.copy(apertureBasisVector2);
	raytracingSphereShaderMaterial.uniforms.viewDirection.value.copy(viewDirection);
	raytracingSphereShaderMaterial.uniforms.backgroundCentre.value.copy(backgroundCentre);
	raytracingSphereShaderMaterial.uniforms.apertureRadius.value = apertureRadius;

	let focusDistance = Math.tan(atanFocusDistance);
	
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
			backgroundTexture: { value: videoFeedETexture },
			videoFeedUTexture: { value: videoFeedUTexture }, 
			videoFeedETexture: { value: videoFeedETexture }, 
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

			// Calculate the light-ray direction after transmission through a (spherical or cylindrical) lens or lens hologram.
			// d is the incident light-ray direction;
			// pixy is a 2D vector containing the transverse (x, y) components of the vector I-P,
			// i.e. the vector from the principal point P to the intersection point I;
			// TO SIMULATE A CYLINDRICAL LENS, replace (I-P).xy with (I-P).pdHat = pdHat * (I-P).pdHat,
			// i.e. the parts of (I-P).xy parallel to the optical-power direction
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

						// raytrace through elements here

						if(keepVideoFeedForward) 
							color = getColorOfBackground(p, d, b, backgroundTexture, halfWidthBackground, halfHeightBackground, backgroundColour);
							// color = getColorOfVideoFeed(p, d, b, videoFeedETexture, halfWidthE, halfHeightE, vec4(1, 1, 1, 1.0));
						else color = getColorOfVideoFeed(p, d, b, -videoDistance, videoFeedETexture, halfWidthE, halfHeightE, vec4(1, 1, 1, 1.0));
					} else {
						// the ray is travelling "backwards", in the (+z) direction;

						// raytrace through elements here

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
		'Horiz. FOV (&deg;)': fovScreen,
		'Aperture radius': apertureRadius,
		'tan<sup>-1</sup>(focus. dist.)': atanFocusDistance,
		'No of rays': noOfRays,
		'Env.-facing cam. (&deg;)': fovVideoFeedE,
		'User-facing cam. (&deg;)': fovVideoFeedU,
		'tan<sup>-1</sup>(distance)': Math.atan(raytracingSphereShaderMaterial.uniforms.videoDistance.value),
		'Autofocus': autofocus,
		'Video feed forward': raytracingSphereShaderMaterial.uniforms.keepVideoFeedForward.value,
		'Image': background,
		'Point forward (in -<b>z</b> direction)': pointForward,
		'Show/hide info': toggleInfoVisibility,
		'Restart camera video': function() { 
			recreateVideoFeeds(); 
			postStatus("Restarting video stream");
		}
	}

	const folderBackground = gui.addFolder( 'Background' );
	folderBackground.add( GUIParams, 'Image', 
	{ 
		'Camera video': 0, 
		'Dr TIM': 1,
		'Buzz Aldrin': 2,
		// 'Pillars of creation': 3,
		// 'Lunch atop a skyscraper': 4,
		'Descent from Half Dome': 3
		// 'Blue marble': 6
	} ).name( 'Test' ).onChange( (b) => { background = b; });
	folderBackground.add( GUIParams, 'tan<sup>-1</sup>(distance)', Math.atan(0.1), 0.5*Math.PI).onChange( (a) => { raytracingSphereShaderMaterial.uniforms.videoDistance.value = Math.tan(a); } );
	folderBackground.add( GUIParams, 'Horiz. FOV (&deg;)', 10, 170, 1).onChange( (fov) => { fovBackground = fov; });   
	// folderBackground.add( params, 'Env.-facing cam. (&deg;)', 10, 170, 1).onChange( (fov) => { fovVideoFeedE = fov; });   
	// folderBackground.add( params, 'User-facing cam. (&deg;)', 10, 170, 1).onChange( (fov) => { fovVideoFeedU = fov; });   
	folderBackground.add( GUIParams, 'Restart camera video');
	// folderBackground.close();

	const folderVirtualCamera = gui.addFolder( 'Virtual camera' );
	folderVirtualCamera.add( GUIParams, 'Horiz. FOV (&deg;)', 10, 170, 1).onChange( setScreenFOV );
	folderVirtualCamera.add( GUIParams, 'Aperture radius', 0.0, 1.0, 0.01).onChange( (r) => { apertureRadius = r; } );
	folderVirtualCamera.add( GUIParams, 'Autofocus' ).onChange( (b) => { autofocus = b; focusDistanceControl.disable(autofocus); } );
	focusDistanceControl = folderVirtualCamera.add( GUIParams, 'tan<sup>-1</sup>(focus. dist.)', 
		//Math.atan(0.1), 
		-0.5*Math.PI,
		0.5*Math.PI,
		0.001
	).onChange( (a) => { atanFocusDistance = a; } );
	// folderVirtualCamera.add( atanFocusDistance, 'atan focus dist', -0.5*Math.PI, +0.5*Math.PI ).listen();
	folderVirtualCamera.add( GUIParams, 'No of rays', 1, 100, 1).onChange( (n) => { noOfRays = n; } );
	folderVirtualCamera.add( GUIParams, 'Point forward (in -<b>z</b> direction)' );
	// folderVirtualCamera.close();

	// const folderSettings = gui.addFolder( 'Other controls' );
	// // folderSettings.add( params, 'Video feed forward' ).onChange( (b) => { raytracingSphereShaderMaterial.uniforms.keepVideoFeedForward.value = b; } );
	// // folderSettings.add( params, 'Lenslet type', { 'Ideal thin': true, 'Phase hologram': false } ).onChange( (t) => { raytracingSphereShaderMaterial.uniforms.idealLenses.value = t; });
	// // folderSettings.add( params, 'Ideal lenses').onChange( (b) => { raytracingSphereShaderMaterial.uniforms.idealLenses.value = b; } );
	// folderSettings.add( params, 'Show/hide info');
	// folderSettings.close();
}

function addXRInteractivity() {
	// see https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_sandbox.html

	// the two hand controllers

	// const geometry = new THREE.BufferGeometry();
	// geometry.setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 5 ) ] );

	// const controller1 = renderer.xr.getController( 0 );
	// controller1.add( new THREE.Line( geometry ) );
	// scene.add( controller1 );

	// const controller2 = renderer.xr.getController( 1 );
	// controller2.add( new THREE.Line( geometry ) );
	// scene.add( controller2 );

	//

	// const controllerModelFactory = new XRControllerModelFactory();

	// const controllerGrip1 = renderer.xr.getControllerGrip( 0 );
	// controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
	// scene.add( controllerGrip1 );

	// const controllerGrip2 = renderer.xr.getControllerGrip( 1 );
	// controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
	// scene.add( controllerGrip2 );

	//

	const group = new InteractiveGroup( renderer, camera );
	// group.listenToPointerEvents( renderer, camera );
	// group.listenToXRControllerEvents( controller1 );
	// group.listenToXRControllerEvents( controller2 );
	scene.add( group );

	const mesh = new HTMLMesh( gui.domElement );
	mesh.position.x = - 0.75;
	mesh.position.y = 1.5;
	mesh.position.z = - 0.5;
	mesh.rotation.y = Math.PI / 4;
	mesh.scale.setScalar( 2 );
	// group.add( mesh );	
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

		storedPhotoDescription = `${name}`;
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

			// Use the Web Share API to share the screenshot
			if (navigator.share) {
				navigator.share({
					title: storedPhotoDescription,
					text: storedPhotoInfoString,
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
	status = document.getElementById('status');
	postStatus("Welcome!");
}

function postStatus(text) {
	status.innerHTML = '&nbsp;'+text;
	console.log('status: '+text);

	// show the text only for 3 seconds
	statusTime = new Date().getTime();
	setTimeout( () => { if(new Date().getTime() - statusTime > 2999) status.innerHTML = '&nbsp;'+name+', University of Glasgow, <a href="https://github.com/jkcuk/'+name+'">https://github.com/jkcuk/'+name+'</a>' }, 3000);
}

function getInfoString() {
	return '<br>Background<br>\n' +
 		`&nbsp;&nbsp;Distance from origin = ${raytracingSphereShaderMaterial.uniforms.videoDistance.value.toPrecision(4)}<br>\n` +	// (user-facing) camera
		`&nbsp;&nbsp;Horizontal field of view = ${fovBackground.toPrecision(4)}&deg;<br>\n` +
		// `&nbsp;&nbsp;&nbsp;&nbsp;User-facing camera = ${fovVideoFeedU.toPrecision(4)}&deg;<br>\n` +	// (user-facing) camera
		// `&nbsp;&nbsp;&nbsp;&nbsp;Environment-facing camera = ${fovVideoFeedE.toPrecision(4)}&deg;<br>\n` +	// (environment-facing) camera
		`<br>Virtual camera<br>\n` +
		`&nbsp;&nbsp;Position = (${camera.position.x.toPrecision(4)}, ${camera.position.y.toPrecision(4)}, ${camera.position.z.toPrecision(4)})<br>\n` +
		`&nbsp;&nbsp;Horiz. FOV = ${fovScreen.toPrecision(4)}<br>\n` +
		`&nbsp;&nbsp;Aperture radius = ${apertureRadius.toPrecision(4)}<br>\n` +
		`&nbsp;&nbsp;Focussing distance = ${Math.tan(atanFocusDistance).toPrecision(4)}<br>\n` +
		`&nbsp;&nbsp;Number of rays = ${noOfRays}\n` +
		`<br><br>Stored photo description/name = ${storedPhotoDescription}`
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
	info = document.getElementById('info');
	info.innerHTML = "-- nothing to show (yet) --";
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
			refreshInfo();
			info.style.visibility = "visible";
	}
}