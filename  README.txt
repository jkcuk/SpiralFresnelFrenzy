For running the project locally:
*	I edited the code in Visual Studio Code
*	Build the code by running, from the terminal in the project folder,

 		npx vite

	and pressing 'o', which opens the project in a browser.
	See https://threejs.org/docs/#manual/en/introduction/Installation .
	(When saving any of the code files, the project is re-built and re-loaded automatically,
	in a few milliseconds.)

For deploying the project in github pages:
* 	For some reason, I can get this to work only if the packages are loaded from the internet,
	not from a local folder.  For this reason, the index.html file contains the following:

 		<!-- uncomment the following block when publishing on github pages;
		repository at https://github.com/jkcuk/relativisticDistortionist/,
		page at https://jkcuk.github.io/relativisticDistortionist/
		-->
		<!--
		<script type="importmap">
		{
			"imports": {
				"three": "https://unpkg.com/three@0.161.0/build/three.module.js",
				"three/addons/": "https://unpkg.com/three@0.161.0/examples/jsm/"
		 	}
		}
		</script>
		-->
		
	The <script> block needs to be uncommented to allow loading of packages from the internet.