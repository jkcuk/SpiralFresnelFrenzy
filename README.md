Simulates the view through a spiral adaptive Fresnel lens (see JOSA A **42**, 211-220 (2025), [DOI: 10.1364/JOSAA.540585](https://doi.org/10.1364/JOSAA.540585)).

### Bug

Note that, on certain devices, the simulated spiral adaptive Fresnel lens has no effect when looking through it in the "forward" (-**z**) direction.
It is a mystery to us why this is the case, and so far we have not been able to fix this bug.

At the moment, the best we can offer is the following workaround:  
the effect of the simulated spiral adaptive Fresnel lens appears to be correctly simulated when looking through it in the "backward" (+**z**) direction, and this can be effected by clicking the "Point backward (in +**z** direction)" button at the bottom of the menu.
